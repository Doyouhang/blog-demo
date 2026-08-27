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

// ——— 内容读写 ———

const slugify = (s) =>
  String(s).trim().toLowerCase()
    .replace(/[^\w一-龥-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';

/** YAML 只用得到这几种标量，手写比拉一个依赖划算；但转义必须严谨 */
function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '\n' + value.map((v) => {
      if (v && typeof v === 'object') {
        const inner = toYaml(v, indent + 4).replace(/^\n/, '');
        return `${pad}  - ${inner.trimStart()}`;
      }
      return `${pad}  - ${scalar(v)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    return '\n' + Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${pad}${k}:${typeof v === 'object' ? toYaml(v, indent + 2) : ' ' + scalar(v)}`)
      .join('\n');
  }
  return scalar(value);
}
function scalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '') return '""';
  // 只在真正需要时加引号。这些 md 是要手动看和改的，
  // 无差别加引号（比如把 ILCE-7CM2 写成 "ILCE-7CM2"）会让文件很难读。
  // YAML 里 - / : 只在特定位置才有特殊含义，不是出现就危险。
  const needsQuote =
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) ||   // 首字符是指示符
    /:\s|\s#/.test(s) ||                     // 「冒号空格」开新键，「空格井号」开注释
    /^\s|\s$/.test(s) ||                     // 首尾空白会被吃掉
    /^(true|false|yes|no|on|off|null|~)$/i.test(s) || // 会被解析成布尔/空
    /^[+-]?[\d._]+(e[+-]?\d+)?$/i.test(s) || // 会被解析成数字
    /^\d{4}-\d{2}-\d{2}/.test(s);           // 会被解析成日期/时间戳
  return needsQuote ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
}

function buildMarkdown(front, body) {
  const yaml = Object.entries(front)
    .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}:${typeof v === 'object' ? toYaml(v, 0) : ' ' + scalar(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n\n${(body ?? '').trim()}\n`;
}

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
      out.push({ id: n.name.replace(/\.md$/, ''), title: peekTitle(raw, n.name), raw });
    } else {
      if (!n.isDirectory()) continue;
      const f = path.join(dir, n.name, t.entry);
      if (!existsSync(f)) continue;
      const raw = await readFile(f, 'utf8');
      out.push({ id: n.name, title: peekTitle(raw, n.name), raw });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}
/**
 * 侧栏列表的标题。长文和收藏用 title 就够，
 * 但 moments 常常同一个地点去很多次，只显示地点会看到一串一模一样的条目 ——
 * 对它来说日期才是辨识度所在。
 */
function peekTitle(raw, fallback) {
  const title = raw.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1];
  if (title) return title;
  const date = raw.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})/m)?.[1];
  const place = raw.match(/^place:\s*"?(.+?)"?\s*$/m)?.[1];
  if (date) return date + (place ? ' · ' + place : '');
  return place ?? fallback;
}

// ——— 图片：压缩 + 读 EXIF ———

/**
 * EXIF 的时间不带时区，exifr 默认按 UTC 解析，直接用会整体偏移（东八区差 8 小时）。
 * 所以关掉值转换拿原始字符串，按本机时区还原成快门按下的那个墙上时间。
 */
function exifLocalTime(rawStr) {
  const m = String(rawStr ?? '').match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, Y, M, D, h, mi, s] = m.map(Number);
  const d = new Date(Y, M - 1, D, h, mi, s);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${Y}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(mi)}:${pad(s)}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

async function processImage(buf, destPath) {
  let raw = {};
  try {
    raw = (await exifr.parse(buf, { tiff: true, exif: true, gps: true, reviveValues: false })) ?? {};
  } catch { /* 没有 EXIF 是常态（截图、别人发的图），不该报错 */ }

  const img = sharp(buf, { failOn: 'none' });
  const meta = await img.metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);

  await img
    .rotate() // 按 EXIF orientation 摆正，然后丢掉方向标记，免得下游再转一次
    .resize({ width: longest > MAX_EDGE ? (meta.width >= meta.height ? MAX_EDGE : undefined) : undefined,
              height: longest > MAX_EDGE ? (meta.height > meta.width ? MAX_EDGE : undefined) : undefined,
              withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(destPath);

  const after = await stat(destPath);
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
    shotAt: exifLocalTime(raw.DateTimeOriginal ?? raw.CreateDate),
    // A7C II 机身没有 GPS，多数照片这里是空的；手机拍的通常有
    gps: raw.GPSLatitude ? { lat: raw.latitude, lon: raw.longitude } : null,
    bytes: after.size,
    width: meta.width,
    height: meta.height,
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

    const slug = id || slugify(front.title ?? front.place ?? new Date().toISOString().slice(0, 10));
    const dir = t.flat ? path.join(ROOT, t.dir) : path.join(ROOT, t.dir, slug);
    await mkdir(dir, { recursive: true });
    const file = t.flat ? path.join(dir, slug + '.md') : path.join(dir, t.entry);
    await writeFile(file, buildMarkdown(front, bodyText), 'utf8');
    return { ok: true, id: slug, file: path.relative(ROOT, file) };
  },

  'POST /api/upload': async (body, url) => {
    const type = url.searchParams.get('type');
    const slug = url.searchParams.get('slug');
    const name = url.searchParams.get('name') ?? 'photo.jpg';
    const t = TYPES[type];
    if (!t) throw new Error('未知类型：' + type);

    const dir = t.flat ? path.join(ROOT, t.dir) : path.join(ROOT, t.dir, slug);
    await mkdir(dir, { recursive: true });
    const base = slugify(name.replace(/\.[^.]+$/, '')) + '-' + Date.now().toString(36);
    const dest = path.join(dir, base + '.jpg');
    const info = await processImage(body, dest);
    return { ok: true, src: './' + path.basename(dest), before: body.length, ...info };
  },

  'POST /api/commit': async (body) => {
    const { message } = JSON.parse(body);
    if (!message?.trim()) throw new Error('提交信息不能为空');
    await git('add', '-A');
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

  try {
    if (routes[key]) {
      const body = req.method === 'POST' ? await readBody(req) : null;
      return json(res, 200, await routes[key](body, url));
    }
    // 静态：编辑器页面本身，以及已上传图片的预览
    if (req.method === 'GET') {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await readFile(path.join(here, 'index.html'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (url.pathname.startsWith('/media/')) {
        // 只允许读内容目录下的图，防止路径穿越
        const rel = decodeURIComponent(url.pathname.slice('/media/'.length));
        const abs = path.resolve(ROOT, 'src/content', rel);
        if (!abs.startsWith(path.resolve(ROOT, 'src/content')) || !existsSync(abs)) {
          return json(res, 404, { error: 'not found' });
        }
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        return res.end(await readFile(abs));
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Studio → http://127.0.0.1:${PORT}\n  内容目录：${ROOT}/src/content\n  Ctrl+C 退出\n`);
});
