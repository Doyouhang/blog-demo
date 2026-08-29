// 本地图文编辑器的服务端。只监听 127.0.0.1，只在自己电脑上跑。
//
// 为什么不用 Keystatic：它注入的两个路由都是 prerender: false，会把纯静态站
// 变成需要 SSR adapter 的混合模式（GitHub Pages 跑不了），还要拉进 React 全家桶。
// 更关键的是它不做 EXIF 提取和图片压缩 —— 那恰恰是这个编辑器的核心价值。
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import exifr from 'exifr';
import { TYPES } from './schema.mjs';
import {
  slugify, uniqueSlug, buildMarkdown, peekTitle, exifLocalTime, safeSegment,
  parseExifOffset, sniffIsoBmff, parseFront, parsePhotos,
} from './lib.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PORT = Number(process.env.STUDIO_PORT ?? 4331);

// 图片处理参数。最长边 1800 / q82 大约 300–400KB，一年百来张也就几十 MB。
// 源图存 JPEG 而不是 WebP：Astro 构建时还会生成响应式 WebP，
// 先转一道有损再转一道是白白多丢一次画质。
const MAX_EDGE = 1800;
const QUALITY = 82;

const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024 * 1024) { reject(new Error('请求体过大（上限 64MB）')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

// ——— 安全 ———

/**
 * 最后一道闸：确认路径确实落在指定内容目录里面。
 * 前面已经用 safeSegment 收敛过片段，这里再断言一次 —— 拼路径的地方有好几处，
 * 将来加新接口时忘了校验，这条能兜住。
 *
 * 注意用 base + path.sep 而不是裸前缀匹配：光比 startsWith 的话，
 * src/content-backup/ 也能通过 src/content 的检查。
 */
function assertInside(target, relBase) {
  const base = path.resolve(ROOT, relBase);
  const abs = path.resolve(target);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error('路径越界：' + abs);
  }
  return abs;
}

/**
 * 只监听 127.0.0.1 挡不住浏览器。任意网页都能发
 * fetch('http://127.0.0.1:4331/api/push', {method:'POST', mode:'no-cors'}) ——
 * 这是简单请求，不触发预检，响应虽然读不到，但**动作已经执行了**，
 * 也就是说随便一个开着的标签页就能把站部署上线。
 * 同理 /api/save 配上路径穿越就是任意文件写。
 *
 * 校验 Origin 挡掉跨站发起；校验 Host 挡掉 DNS 重绑定
 * （攻击者把自己的域名解析到 127.0.0.1，Origin 是他的域名，但 Host 也是）。
 */
function sameOrigin(req) {
  const allowed = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
  const host = req.headers.host ?? '';
  if (!new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]).has(host)) return false;
  const origin = req.headers.origin;
  // 同源的简单 GET 可能不带 Origin；写操作一律要求带且匹配
  if (req.method !== 'GET') return !!origin && allowed.has(origin);
  return !origin || allowed.has(origin);
}

// ——— 内容读写 ———

// 解析放在服务端做，和 buildMarkdown 在同一个模块里 ——
// 序列化和反序列化必须成对，分居两处迟早失配（客户端那份就漏还原了两种转义，
// 编辑一次多一层反斜杠）。现在它们由同一组往返测试锁着。
const parsed = (raw) => {
  const { front, body } = parseFront(raw);
  return { front, body, photos: parsePhotos(raw) };
};

async function listEntries(typeKey) {
  const t = TYPES[typeKey];
  const dir = path.join(ROOT, t.dir);
  if (!existsSync(dir)) return [];
  const names = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const n of names) {
    if (t.flat) {
      if (!n.isFile() || !n.name.endsWith('.md')) continue;
      const raw = await readFile(path.join(dir, n.name), 'utf8');
      out.push({ id: n.name.replace(/\.md$/, ''), title: peekTitle(raw, n.name), ...parsed(raw) });
    } else {
      if (!n.isDirectory()) continue;
      const f = path.join(dir, n.name, t.entry);
      if (!existsSync(f)) continue;
      const raw = await readFile(f, 'utf8');
      out.push({ id: n.name, title: peekTitle(raw, n.name), ...parsed(raw) });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

// ——— 图片：压缩 + 读 EXIF ———


async function processImage(buf, destPath) {
  let raw = {};
  try {
    raw = (await exifr.parse(buf, { tiff: true, exif: true, gps: true, reviveValues: false })) ?? {};
  } catch { /* 没有 EXIF 是常态（截图、别人发的图），不该报错 */ }

  const img = sharp(buf, { failOn: 'none' });

  // fit:'inside' 同时约束两条边，与方向无关。
  // 原来按 meta.width/height 判断长边是错的：那是**旋转前**的存储尺寸，
  // 竖构图（6000×4000 + orientation 6）rotate 之后是 4000×6000，
  // 但代码看到 width >= height，只限了宽，结果出来 1800×2700，长边超了 50%。
  await img
    .rotate() // 按 EXIF orientation 摆正，然后丢掉方向标记，免得下游再转一次
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(destPath);

  const after = await stat(destPath);
  const outMeta = await sharp(destPath).metadata();
  const num = (v) => (v == null || v === '' ? undefined : Number(v));
  const fnum = num(raw.FNumber);
  const exp = num(raw.ExposureTime);
  return {
    exif: {
      camera: raw.Model || undefined,
      lens: raw.LensModel || undefined,
      focal: raw.FocalLength ? `${Math.round(Number(raw.FocalLength))}mm` : undefined,
      aperture: fnum ? `f/${fnum}` : undefined,
      shutter: exp ? (exp >= 1 ? `${exp}s` : `1/${Math.round(1 / exp)}s`) : undefined,
      iso: num(raw.ISO ?? raw.ISOSpeedRatings ?? raw.PhotographicSensitivity),
    },
    // 手机会写 OffsetTimeOriginal，相机通常不写。不用它的话，
    // 出门在外拍的照片会按本机时区换算，整体差掉时差那几个小时。
    shotAt: exifLocalTime(
      raw.DateTimeOriginal ?? raw.CreateDate,
      parseExifOffset(raw.OffsetTimeOriginal ?? raw.OffsetTime) ?? undefined
    ),
    // A7C II 机身没有 GPS，多数照片这里是空的；手机拍的通常有
    // 门要开在客户端实际要读的字段上，否则客户端拿到 gps 却读不到 lat 会抛错
    gps: raw.latitude != null && raw.longitude != null ? { lat: raw.latitude, lon: raw.longitude } : null,
    bytes: after.size,
    width: outMeta.width,
    height: outMeta.height,
  };
}

// ——— git ———

const git = (...args) => run('git', args, { cwd: ROOT });
async function gitStatus() {
  const { stdout } = await git('status', '--porcelain');
  const files = stdout.split('\n').filter(Boolean).map((l) => l.slice(3));
  let ahead = 0;
  try {
    const r = await git('rev-list', '--count', 'origin/main..main');
    ahead = Number(r.stdout.trim()) || 0;
  } catch { /* 没有 origin/main 时忽略 */ }
  return { files, ahead };
}

// ——— 路由 ———

const routes = {
  'GET /api/state': async () => {
    const collections = {};
    for (const k of Object.keys(TYPES)) collections[k] = await listEntries(k);
    return { types: TYPES, collections, git: await gitStatus() };
  },

  'POST /api/save': async (body) => {
    const { type, id, front, bodyText } = JSON.parse(body);
    const t = TYPES[type];
    if (!t) throw new Error('未知类型：' + type);

    const fileFor = (slug) =>
      t.flat ? path.join(ROOT, t.dir, slug + '.md') : path.join(ROOT, t.dir, slug, t.entry);

    let slug;
    if (id) {
      // 编辑已有条目：id 直接来自请求体，必须收敛成单级安全名字
      slug = safeSegment(id);
      if (!slug) throw new Error('条目 id 不合法：' + id);
    } else {
      // 新建：同名的要让路。同一个地点去两次、同一天两条没写地点的动态，
      // 派生出的 slug 完全一样，直接写就把上一条整个覆盖了 —— 连照片都变孤儿。
      const base = slugify(front.title ?? front.place ?? new Date().toISOString().slice(0, 10));
      slug = uniqueSlug(base, (s) => existsSync(fileFor(s)));
    }

    const file = fileFor(slug);
    assertInside(file, t.dir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buildMarkdown(front, bodyText), 'utf8');
    return { ok: true, id: slug, file: path.relative(ROOT, file) };
  },

  'POST /api/upload': async (body, url) => {
    const type = url.searchParams.get('type');
    const slug = url.searchParams.get('slug');
    const name = url.searchParams.get('name') ?? 'photo.jpg';
    const t = TYPES[type];
    if (!t) throw new Error('未知类型：' + type);

    let dir;
    if (t.flat) {
      dir = path.join(ROOT, t.dir);
    } else {
      const safe = safeSegment(slug);
      if (!safe) throw new Error('slug 不合法：' + slug);
      dir = path.join(ROOT, t.dir, safe);
    }
    // 先认格式，再动文件系统 —— 否则一张传不了的图会留下一个空目录。
    // sharp 对 HEIC 抛的是编解码插件层面的错，原样透给前端
    // 等于让人对着一句天书猜自己该干嘛。
    const bmff = sniffIsoBmff(body);
    if (bmff) {
      throw new Error(
        `这张是 ${bmff} 格式，当前环境解不了。` +
        '手机上关掉相机设置里的「高效率格式 / HEIF」改存 JPG，或者先把这张转成 JPG 再传。'
      );
    }

    assertInside(dir, t.dir);
    await mkdir(dir, { recursive: true });
    const base = slugify(name.replace(/\.[^.]+$/, '')) + '-' + Date.now().toString(36);
    const dest = path.join(dir, base + '.jpg');
    const info = await processImage(body, dest);
    return { ok: true, src: './' + path.basename(dest), before: body.length, ...info };
  },

  'POST /api/commit': async (body) => {
    const { message } = JSON.parse(body);
    if (!message?.trim()) throw new Error('提交信息不能为空');
    // 只交内容目录。原来是 git add -A，会把手头没写完的代码改动一起提交，
    // 再点「发布上线」就直接推到 main 部署了 —— 一个标着「提交」的按钮不该干这个。
    await git('add', '--', 'src/content');
    await git('commit', '-m', message.trim());
    return { ok: true, git: await gitStatus() };
  },

  // push 单独一个动作：推到 main 会触发 Actions 部署上线，不能和保存混在一起
  'POST /api/push': async () => {
    const { stdout, stderr } = await git('push', 'origin', 'main');
    return { ok: true, out: (stdout + stderr).trim(), git: await gitStatus() };
  },

  'POST /api/check': async () => {
    try {
      const { stdout } = await run('npm', ['run', 'check'], { cwd: ROOT, timeout: 120000 });
      return { ok: true, out: stdout.slice(-2000) };
    } catch (e) {
      return { ok: false, out: ((e.stdout ?? '') + (e.stderr ?? '')).slice(-2000) };
    }
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  if (!sameOrigin(req)) {
    return json(res, 403, {
      error: '请求来源不对。这个服务只接受本机浏览器从 http://127.0.0.1:' + PORT + ' 发出的请求。',
    });
  }

  try {
    if (routes[key]) {
      const body = req.method === 'POST' ? await readBody(req) : null;
      return json(res, 200, await routes[key](body, url));
    }
    // 静态：编辑器页面本身，以及已上传图片的预览
    if (req.method === 'GET') {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await readFile(path.join(here, 'index.html'));
        // 不给缓存。这个页面是每次请求现读的，改完刷新就该生效；
        // 浏览器要是缓存住旧页面，就会拿旧客户端去读新服务端的返回，
        // 症状是点开条目一片空白 —— 而且完全看不出是缓存的锅。
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store, must-revalidate',
        });
        return res.end(html);
      }
      if (url.pathname.startsWith('/media/')) {
        // 只允许读内容目录下的图。用 assertInside 而不是裸 startsWith ——
        // 后者连 src/content-backup/ 都会放行。
        const rel = decodeURIComponent(url.pathname.slice('/media/'.length));
        let abs;
        try {
          abs = assertInside(path.resolve(ROOT, 'src/content', rel), 'src/content');
        } catch {
          return json(res, 404, { error: 'not found' });
        }
        // 只服务图片。原来任何文件（含 .md）都按 image/jpeg 吐出去。
        const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
        const type = MIME[path.extname(abs).toLowerCase()];
        if (!type || !existsSync(abs)) return json(res, 404, { error: 'not found' });
        res.writeHead(200, { 'content-type': type });
        return res.end(await readFile(abs));
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${PORT} 已被占用。`);
    console.error('  可能是上一个 studio 没退干净：pkill -f "studio/server.mjs"');
    console.error(`  或者换一个：STUDIO_PORT=4341 npm run studio\n`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Studio → http://127.0.0.1:${PORT}\n  内容目录：${ROOT}/src/content\n  Ctrl+C 退出\n`);
});
