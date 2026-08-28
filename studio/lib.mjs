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
