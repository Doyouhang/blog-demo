// 封面检索的回归测试。
// 安全那几条是重点：/api/cover/thumb?u= 把一个任意 URL 交给服务端去请求，
// 白名单一旦能绕过，它就是个能从浏览器打到内网的洞。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedImageUrl, toHttps, bigImageUrl,
  fromDoubanBook, fromDoubanMovie, fromQQ, fromItunes, fromNetease,
  searchCovers, fetchCoverImage,
} from '../studio/covers.mjs';

test('白名单：认的主机放行', () => {
  for (const u of [
    'https://img9.doubanio.com/view/subject/s/public/s1800355.jpg',
    'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p1512562287.jpg',
    'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/x/100x100bb.jpg',
    'https://y.gtimg.cn/music/photo_new/T002R180x180M000000I5jJB3blWeN_3.jpg',
    'https://p1.music.126.net/abc==/109951171007564000.jpg',
  ]) assert.equal(isAllowedImageUrl(u), true, u);
});

test('白名单：伪装成白名单的主机必须挡住', () => {
  // 用 includes 判断的话这几条全会放行 —— 必须按 hostname 精确匹配
  for (const u of [
    'https://img9.doubanio.com.evil.com/x.jpg',      // 后缀伪装
    'https://evil.com/?x=img9.doubanio.com',          // 藏在查询串里
    'https://evil.com/img9.doubanio.com/x.jpg',       // 藏在路径里
    'https://doubanio.com.attacker.net/x.jpg',
    'https://notmzstatic.com/x.jpg',
  ]) assert.equal(isAllowedImageUrl(u), false, u);
});

test('白名单：内网地址和非 http 协议一律拒', () => {
  // 这才是 SSRF 真正想打的目标：从服务端去够浏览器够不到的地方
  for (const u of [
    'http://127.0.0.1:4331/api/state',
    'http://localhost/',
    'http://169.254.169.254/latest/meta-data/',        // 云厂商元数据端点
    'http://192.168.1.1/',
    'http://[::1]/',
    'file:///etc/passwd',
    'ftp://img9.doubanio.com/x.jpg',
    '', null, undefined, 'not a url',
  ]) assert.equal(isAllowedImageUrl(u), false, String(u));
});

test('小图换大图：四家各自的尺寸字段', () => {
  assert.equal(
    bigImageUrl('https://img9.doubanio.com/view/subject/s/public/s1800355.jpg'),
    'https://img9.doubanio.com/view/subject/l/public/s1800355.jpg');
  assert.equal(
    bigImageUrl('https://img3.doubanio.com/view/photo/s_ratio_poster/public/p1512562287.jpg'),
    'https://img3.doubanio.com/view/photo/l_ratio_poster/public/p1512562287.jpg');
  assert.equal(
    bigImageUrl('https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg'),
    'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg');
  assert.equal(
    bigImageUrl('http://y.gtimg.cn/music/photo_new/T002R180x180M000000I5jJB3blWeN_3.jpg'),
    'https://y.gtimg.cn/music/photo_new/T002R500x500M000000I5jJB3blWeN_3.jpg');
  assert.equal(
    bigImageUrl('https://p1.music.126.net/abc==/109951171007564000.jpg'),
    'https://p1.music.126.net/abc==/109951171007564000.jpg?param=600y600');
});

test('小图换大图：认不出格式就原样返回，不能返回 undefined', () => {
  const odd = 'https://img9.doubanio.com/some/new/layout/x.jpg';
  assert.equal(bigImageUrl(odd), odd);
  assert.equal(toHttps('http://y.qq.com/a.jpg'), 'https://y.qq.com/a.jpg');
});

test('归一化：豆瓣图书', () => {
  const out = fromDoubanBook([
    { title: '置身事内', pic: 'https://img3.doubanio.com/view/subject/s/public/s33956867.jpg',
      author_name: '兰小欢', year: '2021' },
    { title: '缺图的条目', year: '2020' },   // 没有封面的要丢掉，否则网格里出现空洞
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, '置身事内');
  assert.equal(out[0].subtitle, '兰小欢 · 2021');
  assert.ok(out[0].full.includes('/view/subject/l/'));
});

test('归一化：豆瓣电影标出剧集', () => {
  const out = fromDoubanMovie([
    { title: '狂飙', img: 'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg',
      year: '2023', episode: '39', sub_title: '狂飙' },
  ]);
  assert.equal(out[0].subtitle, '2023 · 剧集');
});

test('归一化：三家音乐源都能出结果', () => {
  assert.equal(fromQQ({ data: { album: { itemlist: [
    { name: '范特西', singer: '周杰伦', pic: 'http://y.gtimg.cn/music/photo_new/T002R180x180M000abc.jpg' },
  ] } } })[0].source, 'QQ音乐');
  assert.equal(fromItunes({ results: [
    { collectionName: '范特西', artistName: '周杰伦', releaseDate: '2001-09-14T07:00:00Z',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg' },
  ] })[0].subtitle, '周杰伦 · 2001');
  assert.equal(fromNetease({ result: { albums: [
    { name: '后青春期的诗', artist: { name: '五月天' }, publishTime: 1217952000000,
      picUrl: 'https://p1.music.126.net/abc==/1.jpg' },
  ] } })[0].source, '网易云');
});

test('归一化：空响应和缺字段不能炸', () => {
  for (const fn of [fromDoubanBook, fromDoubanMovie]) {
    assert.deepEqual(fn(null), []);
    assert.deepEqual(fn([]), []);
    assert.deepEqual(fn([{}]), []);
  }
  assert.deepEqual(fromQQ({}), []);
  assert.deepEqual(fromItunes(undefined), []);
  assert.deepEqual(fromNetease({ result: {} }), []);
});

test('搜索：一家挂了不影响另外几家', async () => {
  // 这些都是非公开接口，指望不上它们同时在线。
  // 一家超时就整个搜索失败的话，这功能三天两头是坏的。
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('qq.com')) throw new Error('故意让 QQ 挂掉');
    if (u.includes('itunes')) return new Response(JSON.stringify({ results: [
      { collectionName: '范特西', artistName: '周杰伦',
        artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg' },
    ] }), { headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ result: { albums: [] } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const { results, failed } = await searchCovers('song', '范特西');
    assert.equal(results.length, 1, 'iTunes 那条要留下来');
    assert.equal(results[0].source, 'iTunes');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].source, 'QQ音乐');
  } finally { globalThis.fetch = real; }
});

test('搜索：空关键词直接返回空，不打网络', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('不该发起请求'); };
  try {
    assert.deepEqual((await searchCovers('book', '   ')).results, []);
  } finally { globalThis.fetch = real; }
});

test('搜索：结果里混进非白名单图片要被滤掉', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { title: '正常', pic: 'https://img9.doubanio.com/view/subject/s/public/a.jpg', author_name: 'x' },
    { title: '被劫持的结果', pic: 'https://evil.com/a.jpg', author_name: 'y' },
  ]), { headers: { 'content-type': 'application/json' } });
  try {
    const { results } = await searchCovers('book', '测试');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '正常');
  } finally { globalThis.fetch = real; }
});

test('下载：非白名单地址在发请求之前就被拒', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('不该走到发请求这一步'); };
  try {
    await assert.rejects(
      () => fetchCoverImage('http://169.254.169.254/latest/meta-data/'),
      /不在允许的来源/);
  } finally { globalThis.fetch = real; }
});

test('下载：返回的不是图片要拒，太大也要拒', async () => {
  const real = globalThis.fetch;
  const url = 'https://img9.doubanio.com/view/subject/l/public/a.jpg';
  try {
    globalThis.fetch = async () => new Response('<html>418</html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(() => fetchCoverImage(url), /不是图片/);

    globalThis.fetch = async () => new Response(Buffer.alloc(200), { headers: { 'content-type': 'image/jpeg' } });
    await assert.rejects(() => fetchCoverImage(url, 100), /太大/);

    globalThis.fetch = async () => new Response(Buffer.alloc(0), { headers: { 'content-type': 'image/jpeg' } });
    await assert.rejects(() => fetchCoverImage(url), /空文件/);
  } finally { globalThis.fetch = real; }
});
