// Studio 的纯函数：YAML 序列化、Markdown 组装、slug 派生、EXIF 时间换算。
//
// 单独成文件是为了能测。这些函数没有 I/O，却负责往内容库里写东西 ——
// 代码评审在这里一次揪出四个会静默毁数据的 bug（多行值产出非法 YAML、
// 空 alt 让构建挂掉、同名条目直接覆盖、图片方向导致尺寸超限），
// 全都是几行 node:test 就能拦住的。

/** 从标题派生文件名。只保留字母数字和常见文字，其余压成连字符。 */
export function slugify(s) {
  return (
    String(s)
      .trim()
      .toLowerCase()
      // 中日韩统一表意文字 + 日文假名 + 谚文，都保留 ——
      // 只留 \w 和汉字的话，「竹内まりや」这种整条被抹成 untitled
      .replace(/[^\w぀-ヿ㐀-䶿一-鿿가-힯-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'untitled'
  );
}

/**
 * 文件名冲突时追加序号。
 * 新建条目直接按标题派生 slug，同一个地点去两次、或者同一天发两条没写地点的动态，
 * 派生出的名字一模一样 —— 不查重就会把上一条整个覆盖掉，连照片都变成孤儿。
 */
export function uniqueSlug(base, exists) {
  if (!exists(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error(`${base} 已经有上千个同名条目了，检查一下是不是哪里不对`);
}

export function scalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '') return '""';
  // 只在真正需要时加引号。这些 md 是要手动看和改的，
  // 无差别加引号（比如把 ILCE-7CM2 写成 "ILCE-7CM2"）会让文件很难读。
  // YAML 里 - / : 只在特定位置才有特殊含义，不是出现就危险。
  const needsQuote =
    /[\n\r]/.test(s) ||                      // 换行必须走双引号 + 转义，否则整个 YAML 就废了
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) ||    // 首字符是指示符
    /:\s|\s#/.test(s) ||                     // 「冒号空格」开新键，「空格井号」开注释
    /^\s|\s$/.test(s) ||                     // 首尾空白会被吃掉
    /^(true|false|yes|no|on|off|null|~)$/i.test(s) || // 会被解析成布尔/空
    /^[+-]?[\d._]+(e[+-]?\d+)?$/i.test(s) || // 会被解析成数字
    /^\d{4}-\d{2}-\d{2}/.test(s);            // 会被解析成日期/时间戳
  if (!needsQuote) return s;
  // 双引号形式支持 \n 转义；裸换行会被 YAML 折成空格，内容悄悄变样
  return `"${s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')}"`;
}

export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return (
      '\n' +
      value
        .map((v) => {
          if (v && typeof v === 'object') {
            const inner = toYaml(v, indent + 4).replace(/^\n/, '');
            return `${pad}  - ${inner.trimStart()}`;
          }
          return `${pad}  - ${scalar(v)}`;
        })
        .join('\n')
    );
  }
  if (value && typeof value === 'object') {
    return (
      '\n' +
      Object.entries(value)
        // 只丢 undefined。空字符串要保留 —— photos 里的 alt 是 schema 必填项，
        // 顺手过滤掉的话生成的文件缺字段，构建期 Zod 直接报错。
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${pad}${k}:${v !== null && typeof v === 'object' ? toYaml(v, indent + 2) : ' ' + scalar(v)}`)
        .join('\n')
    );
  }
  return scalar(value);
}

export function buildMarkdown(front, body) {
  const yaml = Object.entries(front)
    .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}:${v !== null && typeof v === 'object' ? toYaml(v, 0) : ' ' + scalar(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n\n${(body ?? '').trim()}\n`;
}

/**
 * 侧栏列表的标题。长文和收藏用 title 就够，
 * 但 moments 常常同一个地点去很多次，只显示地点会看到一串一模一样的条目 ——
 * 对它来说日期才是辨识度所在。
 */
export function peekTitle(raw, fallback) {
  const title = raw.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1];
  if (title) return title;
  const date = raw.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})/m)?.[1];
  const place = raw.match(/^place:\s*"?(.+?)"?\s*$/m)?.[1];
  if (date) return date + (place ? ' · ' + place : '');
  return place ?? fallback;
}

/**
 * EXIF 的时间不带时区，exifr 默认按 UTC 解析，直接用会整体偏移（东八区差 8 小时）。
 * 所以关掉值转换拿原始字符串，按指定时区还原成快门按下的那个墙上时间。
 * offsetMinutes 传进来是为了能测（默认用本机时区）。
 */
export function exifLocalTime(rawStr, offsetMinutes) {
  const m = String(rawStr ?? '').match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, Y, M, D, h, mi, s] = m.map(Number);
  const off = offsetMinutes ?? -new Date(Y, M - 1, D, h, mi, s).getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${Y}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(mi)}:${pad(s)}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/**
 * scalar 的逆运算。**这两个必须成对改** —— scalar 转义了三样东西
 * （反斜杠、双引号、换行），只还原其中一样的话，编辑一次就多一层反斜杠：
 *
 *     "第一行\n第二行"  →  第一行\n第二行（字面）  →  "第一行\\n第二行"  →  …
 *
 * 换行则永久变成字面的两个字符。所以必须单次扫描，不能分别 replace ——
 * 分开做的话 \\n（转义的反斜杠后面跟个 n）会被误当成换行。
 */
export function unquote(s) {
  const str = String(s ?? '');
  const m = str.match(/^"([\s\S]*)"$/);
  if (!m) return str;
  return m[1].replace(/\\(.)/g, (_, c) =>
    (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));
}

/**
 * 手写的 md 里数组常写成行内形式 tags: ['随笔', '建站']，
 * 而 buildMarkdown 写出来的是多行 - 形式。两种都得认 ——
 * 只认后者的话，用编辑器打开一篇手写的旧文章再保存，
 * 整个数组会被当成一个字符串存回去，标签就此消失。
 * 不是数组字面量就返回 null，交给调用方按标量处理。
 */
function parseInlineArray(v) {
  if (!/^\[[\s\S]*\]$/.test(v)) return null;
  const inner = v.slice(1, -1).trim();
  if (inner === '') return [];
  // 这些 md 的数组项都是简单标量，不会出现带逗号的引号串，按逗号切就够
  return inner
    .split(',')
    .map((x) => unquote(x.trim().replace(/^'([\s\S]*)'$/, '$1')))
    .filter((x) => x !== '');
}

/**
 * 读回 buildMarkdown 写出的文件。够用就行：这些 md 都是本工具写的。
 * photos 那种对象数组这里不还原，交给 parsePhotos —— 它要保住 EXIF 原样。
 */
export function parseFront(raw) {
  const m = String(raw ?? '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: String(raw ?? '').trim() };
  const front = {};
  let key = null;
  let nested = false;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const v = kv[2].trim();
      if (v === '') { front[key] = []; nested = true; }
      else { front[key] = parseInlineArray(v) ?? unquote(v); nested = false; }
      continue;
    }
    if (!nested || !key) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (!item) continue;
    // 「- src: ./a.jpg」这种是对象数组的头一行，不是标量项
    if (/^\w+:\s/.test(item[1])) { delete front[key]; nested = false; continue; }
    front[key].push(unquote(item[1]));
  }
  return { front, body: m[2].trim() };
}

/**
 * photos 是嵌套结构，上面那个浅解析器还原不出来。
 * 只解析到「有哪几张图 + alt」，EXIF 原样保留 —— 重新保存时不会把相机信息弄丢。
 */
export function parsePhotos(raw) {
  const seg = String(raw ?? '').match(/^photos:\n([\s\S]*?)(?=^\w+:|^---)/m);
  if (!seg) return [];
  const out = [];
  for (const block of seg[1].split(/^\s+- /m).slice(1)) {
    const src = block.match(/src:\s*(.+)/)?.[1]?.trim();
    const alt = unquote(block.match(/alt:\s*(.+)/)?.[1]?.trim() ?? '');
    const exif = {};
    for (const k of ['camera', 'lens', 'focal', 'aperture', 'shutter', 'iso']) {
      const v = block.match(new RegExp(k + ':\\s*(.+)'))?.[1]?.trim();
      if (v) exif[k] = k === 'iso' ? Number(unquote(v)) : unquote(v);
    }
    if (src) out.push({ src: unquote(src), alt, exif: Object.keys(exif).length ? exif : undefined });
  }
  return out;
}

/**
 * 收藏条目的 kind 决定长文挂在哪个兴趣页下。
 * 对不上的话，写的影评会跑到读书页的侧栏里去。
 */
export const TOPIC_BY_KIND = { book: 'reading', movie: 'watching', song: 'music' };

const NOTE_SUFFIX = { book: '读后', movie: '观后', song: '听后' };

/** 长文标题：没填就按条目标题派生。空标题会让 essays 的 Zod 校验在构建期报错 */
export function noteTitleFor(kind, itemTitle, given) {
  const t = String(given ?? '').trim();
  if (t) return t;
  const name = String(itemTitle ?? '').trim() || '无题';
  return `《${name}》${NOTE_SUFFIX[kind] ?? '手记'}`;
}

/**
 * 长文的文件名：跟着条目走，加 -note 后缀。
 * 已经关联过的沿用原来的 id —— 不然每保存一次就多出一篇孤儿长文。
 */
export function noteSlugFor(itemSlug, existingEssayId) {
  const keep = String(existingEssayId ?? '').trim();
  if (keep) return keep;
  return `${slugify(itemSlug)}-note`;
}

/**
 * EXIF 的 OffsetTimeOriginal 形如 "+09:00" / "-05:00"，换算成分钟。
 * 手机基本都会写这个字段，相机常常不写 —— 不写的时候返回 null，
 * 由调用方回退到本机时区（在家门口拍的照片，这个回退是对的）。
 */
export function parseExifOffset(str) {
  const m = String(str ?? '').match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const [, sign, h, mi] = m;
  const minutes = Number(h) * 60 + Number(mi);
  if (!Number.isFinite(minutes) || minutes > 14 * 60) return null; // 现实中最大是 +14:00
  return sign === '-' ? -minutes : minutes;
}

/**
 * 认出 HEIC/HEIF 这类 ISO BMFF 图片。
 * sharp 的 format 表会说 heif「可读」，但那只代表认得容器 —— libheif 是模块化的，
 * 这个预编译包没带 HEVC 解码插件，真喂给它会抛
 * 「Support for this compression format has not been built in」，
 * 对着这句话没人猜得到该去关手机相机里的「高效率格式」开关。
 */
export function sniffIsoBmff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.toString('latin1', 4, 8) !== 'ftyp') return null;
  const brand = buf.toString('latin1', 8, 12);
  if (brand === 'avif' || brand === 'avis') return 'AVIF';
  const HEIF = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
  return HEIF.includes(brand) ? 'HEIC/HEIF' : null;
}

/**
 * 把用户给的路径片段收敛成安全的单级名字。
 * type 是查表来的所以安全，但 id / slug 直接来自请求体和查询串，
 * 不收拾就能用 ../../ 写到 src/content 外面去。
 */
export function safeSegment(s) {
  const raw = String(s ?? '');
  if (!raw || raw === '.' || raw === '..') return null;
  if (raw.includes('/') || raw.includes('\\') || raw.includes('\0')) return null;
  const clean = slugify(raw);
  return clean === 'untitled' && slugify(raw) !== slugify(raw.trim()) ? null : clean;
}
