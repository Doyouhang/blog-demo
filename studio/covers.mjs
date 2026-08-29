// 封面检索：输入名字，从书影音各自的源搜出候选封面。
//
// 三条实测结论决定了这里的形状（探测记录见 README 的「封面检索」一节）：
//
// 1. 豆瓣图片有防盗链 —— 不带 Referer 直接返回 HTTP 418。浏览器伪造不了跨站
//    Referer，所以搜索、缩略图、下大图三步全得服务端代理，没有别的选择。
// 2. 豆瓣音乐的 subject_suggest 已经废了（任何查询词都返回空数组），
//    音乐改走 QQ / iTunes / 网易云三家并行，结果合并 —— 它们的库互相补不齐：
//    周杰伦在网易云是下架的，而 iTunes 的华语老专辑不如 QQ 全。
// 3. 各家的大图都是把小图 URL 里的尺寸字段换掉，不用另外请求。
//
// 这些都是非公开接口，随时可能改结构或封掉。所以每个源都是**独立降级**的：
// 一家挂了不影响另外几家，全挂了也只是搜不到，手动上传那条路照旧。

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TIMEOUT_MS = 12000;

/**
 * 图片主机白名单。
 *
 * /api/cover/thumb?u=<任意URL> 天生是个 SSRF 洞 —— 不设限的话，
 * 拿它去请求 127.0.0.1 或云厂商的元数据端点都行，而那是从浏览器发不出去的请求。
 * 所以按 hostname 精确匹配，绝不能用 includes：
 * img9.doubanio.com.evil.com 和 evil.com/?x=img9.doubanio.com 都得挡住。
 */
const IMAGE_HOSTS = [
  /^img\d*\.doubanio\.com$/,
  /^[\w-]+\.mzstatic\.com$/,
  /^y\.gtimg\.cn$/,
  /^y\.qq\.com$/,
  /^p\d*\.music\.126\.net$/,
];

export function isAllowedImageUrl(raw) {
  let u;
  try { u = new URL(String(raw ?? '')); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return IMAGE_HOSTS.some((re) => re.test(u.hostname));
}

/** 图片一律走 https 取，QQ 给的是 http 链接，实测同一路径 https 也通 */
export function toHttps(url) {
  return String(url ?? '').replace(/^http:\/\//, 'https://');
}

/**
 * 小图换大图。各家都把尺寸写在 URL 里，换掉即可，不用多打一次接口。
 * 认不出格式就原样返回 —— 拿小图也比拿不到强。
 */
export function bigImageUrl(url) {
  const u = toHttps(url);
  if (/doubanio\.com/.test(u)) {
    return u
      .replace('/view/subject/s/', '/view/subject/l/')
      .replace('s_ratio_poster', 'l_ratio_poster')
      .replace('/spic/', '/lpic/');
  }
  if (/mzstatic\.com/.test(u)) return u.replace(/\/\d+x\d+bb\.jpg$/, '/600x600bb.jpg');
  if (/y\.gtimg\.cn|y\.qq\.com/.test(u)) return u.replace(/T002R\d+x\d+M000/, 'T002R500x500M000');
  if (/music\.126\.net/.test(u)) return u.split('?')[0] + '?param=600y600';
  return u;
}

const fetchJson = async (url, headers = {}) => {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// ——— 各源的归一化。纯函数，喂响应体出结果，好测 ———

/** 豆瓣图书：pic / author_name / year */
export function fromDoubanBook(list) {
  return (Array.isArray(list) ? list : [])
    .filter((d) => d?.title && d?.pic)
    .map((d) => ({
      source: '豆瓣',
      title: String(d.title),
      subtitle: [d.author_name, d.year].filter(Boolean).join(' · '),
      thumb: toHttps(d.pic),
      full: bigImageUrl(d.pic),
    }));
}

/** 豆瓣电影：img / year / episode（剧集才有） */
export function fromDoubanMovie(list) {
  return (Array.isArray(list) ? list : [])
    .filter((d) => d?.title && d?.img)
    .map((d) => ({
      source: '豆瓣',
      title: String(d.title),
      subtitle: [d.year, d.episode ? '剧集' : null, d.sub_title !== d.title ? d.sub_title : null]
        .filter(Boolean).join(' · '),
      thumb: toHttps(d.img),
      full: bigImageUrl(d.img),
    }));
}

/** QQ 音乐 smartbox：itemlist 里有 mid / name / singer / pic */
export function fromQQ(body) {
  const list = body?.data?.album?.itemlist ?? [];
  return list
    .filter((d) => d?.name && d?.pic)
    .map((d) => ({
      source: 'QQ音乐',
      title: String(d.name),
      subtitle: String(d.singer ?? ''),
      thumb: toHttps(d.pic),
      full: bigImageUrl(d.pic),
    }));
}

/** iTunes：artworkUrl100 换成 600 就是大图 */
export function fromItunes(body) {
  return (body?.results ?? [])
    .filter((a) => a?.collectionName && a?.artworkUrl100)
    .map((a) => ({
      source: 'iTunes',
      title: String(a.collectionName),
      subtitle: [a.artistName, a.releaseDate?.slice(0, 4)].filter(Boolean).join(' · '),
      thumb: toHttps(a.artworkUrl100),
      full: bigImageUrl(a.artworkUrl100),
    }));
}

/** 网易云专辑搜索：picUrl 直接可用，加 param 换尺寸 */
export function fromNetease(body) {
  return (body?.result?.albums ?? [])
    .filter((a) => a?.name && a?.picUrl)
    .map((a) => ({
      source: '网易云',
      title: String(a.name),
      subtitle: [a.artist?.name, a.publishTime ? new Date(a.publishTime).getFullYear() : null]
        .filter((x) => x && x !== 1970).join(' · '),
      thumb: toHttps(a.picUrl),
      full: bigImageUrl(a.picUrl),
    }));
}

// ——— 每个源一个查询器。任何一个抛错都只丢掉自己那份结果 ———

const QUERIES = {
  book: [
    ['豆瓣图书', async (q) =>
      fromDoubanBook(await fetchJson(
        `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`,
        { Referer: 'https://book.douban.com/' }))],
  ],
  movie: [
    ['豆瓣电影', async (q) =>
      fromDoubanMovie(await fetchJson(
        `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`,
        { Referer: 'https://movie.douban.com/' }))],
  ],
  song: [
    ['QQ音乐', async (q) =>
      fromQQ(await fetchJson(
        `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=${encodeURIComponent(q)}&format=json`,
        { Referer: 'https://y.qq.com/' }))],
    ['iTunes', async (q) =>
      fromItunes(await fetchJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=6`))],
    ['网易云', async (q) =>
      fromNetease(await fetchJson(
        `https://music.163.com/api/search/get/web?s=${encodeURIComponent(q)}&type=10&offset=0&limit=6`,
        { Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2' }))],
  ],
};

/** items 的 kind 到搜索源的映射。song 一次打三家 */
export const KINDS = Object.keys(QUERIES);

export async function searchCovers(kind, q) {
  const jobs = QUERIES[kind];
  if (!jobs) throw new Error('不支持的类型：' + kind);
  if (!String(q ?? '').trim()) return { results: [], failed: [] };

  const settled = await Promise.allSettled(jobs.map(([, fn]) => fn(q)));
  const results = [];
  const failed = [];
  settled.forEach((s, i) => {
    const name = jobs[i][0];
    if (s.status === 'fulfilled') results.push(...s.value);
    // 一家挂了只记下来，不影响别家 —— 这些都是非公开接口，指望不上它们一直在
    else failed.push({ source: name, error: s.reason?.message ?? String(s.reason) });
  });
  return { results: results.filter((r) => isAllowedImageUrl(r.full)), failed };
}

/** 下载选中的封面。只认白名单主机，只收图片，大小设上限。 */
export async function fetchCoverImage(url, maxBytes = 8 * 1024 * 1024) {
  if (!isAllowedImageUrl(url)) throw new Error('这个图片地址不在允许的来源里');
  const u = new URL(toHttps(url));
  // 豆瓣按 Referer 放行；带上对别家也无害
  const referer = /doubanio/.test(u.hostname) ? 'https://book.douban.com/'
    : /gtimg|qq\.com/.test(u.hostname) ? 'https://y.qq.com/'
    : /126\.net/.test(u.hostname) ? 'https://music.163.com/' : undefined;
  const r = await fetch(u, {
    headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`取图失败 HTTP ${r.status}`);
  const type = r.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`返回的不是图片（${type || '无类型'}）`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`图片太大（${Math.round(buf.length / 1024)}KB）`);
  if (buf.length === 0) throw new Error('取到的是空文件');
  return { buf, type };
}
