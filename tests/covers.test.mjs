// 封面检索的回归测试。
// 安全那几条是重点：/api/cover/thumb?u= 把一个任意 URL 交给服务端去请求，
// 白名单一旦能绕过，它就是个能从浏览器打到内网的洞。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedImageUrl, toHttps, bigImageUrl,
  fromDoubanBook, fromDoubanMovie, fromDoubanSuggest, fromMaoyan, fromQQ, fromItunes, fromNetease,
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

test('豆瓣通用 suggest：按 hostname 分类，别把电影混进书里', () => {
  // 这个接口一次返回书影音三类，全靠结果 url 的 hostname 区分
  const body = { cards: [
    { title: '让子弹飞', url: 'https://movie.douban.com/subject/3742360/',
      cover_url: 'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg' },
    { title: '万历十五年', url: 'https://book.douban.com/subject/1041482/',
      cover_url: 'https://img9.doubanio.com/view/subject/m/public/s2.jpg' },
    { title: '范特西', url: 'https://music.douban.com/subject/1401843/',
      cover_url: 'https://img1.doubanio.com/view/subject/s/public/s3.jpg' },
  ] };
  assert.deepEqual(fromDoubanSuggest(body, 'movie').map((x) => x.title), ['让子弹飞']);
  assert.deepEqual(fromDoubanSuggest(body, 'book').map((x) => x.title), ['万历十五年']);
  assert.deepEqual(fromDoubanSuggest(body, 'song').map((x) => x.title), ['范特西']);
  // 中图尺寸 /m/ 也要能换成大图
  assert.ok(fromDoubanSuggest(body, 'book')[0].full.includes('/view/subject/l/'));
});

test('豆瓣通用 suggest：url 坏掉的条目直接丢掉，不能炸', () => {
  const body = { cards: [
    { title: '没有 url', cover_url: 'https://img9.doubanio.com/view/subject/s/public/a.jpg' },
    { title: 'url 是垃圾', url: '不是个网址', cover_url: 'https://img9.doubanio.com/view/subject/s/public/b.jpg' },
    { title: '没有封面', url: 'https://book.douban.com/subject/1/' },
  ] };
  assert.deepEqual(fromDoubanSuggest(body, 'book'), []);
  assert.deepEqual(fromDoubanSuggest({}, 'book'), []);
  assert.deepEqual(fromDoubanSuggest(null, 'movie'), []);
});

test('猫眼：影视的第二道保险', () => {
  const out = fromMaoyan({ movies: { list: [
    { nm: '让子弹飞', dir: '姜文', rt: '2010-12-16',
      img: 'https://p0.pipi.cn/mmdb/abc.jpg?imageMogr2/thumbnail/2500x2500%3E' },
    { nm: '没有海报的' },
  ] } });
  assert.equal(out.length, 1);
  assert.equal(out[0].subtitle, '姜文 · 2010');
  assert.equal(out[0].source, '猫眼');
  assert.equal(isAllowedImageUrl(out[0].full), true, '猫眼的图床要在白名单里');
});

test('源返回 200 但恒空时，另一个源要顶上', async () => {
  // 这是上线当天真实发生的：豆瓣 movie 子域的 subject_suggest 从有结果变成
  // 稳定返回 []（HTTP 200，body 就俩字符），不报错、不超时，日志上完全看不出坏了。
  // 当时影视只有这一个源，于是一张图都搜不出来。
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('search_suggest')) {
      return new Response(JSON.stringify({ cards: [] }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ movies: { list: [
      { nm: '让子弹飞', dir: '姜文', rt: '2010-12-16', img: 'https://p0.pipi.cn/mmdb/abc.jpg' },
    ] } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const { results, failed } = await searchCovers('movie', '让子弹飞');
    assert.equal(failed.length, 0, '返回空不算失败，它没报错');
    assert.equal(results.length, 1, '猫眼那条要顶上');
    assert.equal(results[0].source, '猫眼');
  } finally { globalThis.fetch = real; }
});

test('去重时要留信息更全的那条', async () => {
  // 豆瓣通用入口的 abstract 是空的，专用入口才有作者和年份。
  // 先到先得的话，搜「万历十五年」会出一堆同名结果、一条副标题都没有，没法选。
  const same = 'https://img9.doubanio.com/view/subject/l/public/s1800355.jpg';
  const real = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes('search_suggest')
      ? new Response(JSON.stringify({ cards: [
          { title: '万历十五年', url: 'https://book.douban.com/subject/1/',
            cover_url: 'https://img9.doubanio.com/view/subject/s/public/s1800355.jpg', abstract: '' },
        ] }), { headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify([
          { title: '万历十五年', pic: 'https://img9.doubanio.com/view/subject/s/public/s1800355.jpg',
            author_name: '[美] 黄仁宇', year: '1997' },
        ]), { headers: { 'content-type': 'application/json' } });
  try {
    const { results } = await searchCovers('book', '万历十五年');
    assert.equal(results.length, 1);
    assert.equal(results[0].subtitle, '[美] 黄仁宇 · 1997', '要留下带作者年份的那条');
    assert.equal(results[0].full, same);
  } finally { globalThis.fetch = real; }
});

test('多个源撞上同一张图要去重', async () => {
  // 豆瓣通用入口和图书专用入口经常返回同一本书的同一张封面
  const same = 'https://img9.doubanio.com/view/subject/s/public/s1800355.jpg';
  const real = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes('search_suggest')
      ? new Response(JSON.stringify({ cards: [
          { title: '万历十五年', url: 'https://book.douban.com/subject/1/', cover_url: same },
        ] }), { headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify([
          { title: '万历十五年', pic: same, author_name: '黄仁宇' },
        ]), { headers: { 'content-type': 'application/json' } });
  try {
    const { results } = await searchCovers('book', '万历十五年');
    assert.equal(results.length, 1, '同一张图只该出现一次');
  } finally { globalThis.fetch = real; }
});

test('各源都要单独给出 creator，好直接填进表单', () => {
  assert.equal(fromDoubanBook([{ title: '置身事内', author_name: '兰小欢', year: '2021',
    pic: 'https://img3.doubanio.com/view/subject/s/public/a.jpg' }])[0].creator, '兰小欢');
  assert.equal(fromMaoyan({ movies: { list: [{ nm: '让子弹飞', dir: '姜文', rt: '2010-12-16',
    img: 'https://p0.pipi.cn/mmdb/a.jpg' }] } })[0].creator, '姜文');
  assert.equal(fromQQ({ data: { album: { itemlist: [{ name: '范特西', singer: '周杰伦',
    pic: 'http://y.gtimg.cn/music/photo_new/T002R180x180M000a.jpg' }] } } })[0].creator, '周杰伦');
  assert.equal(fromItunes({ results: [{ collectionName: '范特西', artistName: 'Jay Chou',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg' }] })[0].creator, 'Jay Chou');
  assert.equal(fromNetease({ result: { albums: [{ name: '后青春期的诗', artist: { name: '五月天' },
    picUrl: 'https://p1.music.126.net/a==/1.jpg' }] } })[0].creator, '五月天');
  // 豆瓣通用入口给不出作者，但也不能是 undefined —— 客户端要拿它去 trim
  assert.equal(fromDoubanSuggest({ cards: [{ title: '让子弹飞', url: 'https://movie.douban.com/subject/1/',
    cover_url: 'https://img3.doubanio.com/view/photo/s_ratio_poster/public/a.jpg' }] }, 'movie')[0].creator, '');
});

test('去重：带作者的那条要赢过只有副标题的', async () => {
  // 豆瓣通用入口给不出作者。它先到就把猫眼那条挤掉的话，
  // 「顺带填作者」这个功能等于白做。
  const same = 'https://img3.doubanio.com/view/photo/l_ratio_poster/public/p1.jpg';
  const real = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes('search_suggest')
      ? new Response(JSON.stringify({ cards: [{ title: '让子弹飞', abstract: '2010',
          url: 'https://movie.douban.com/subject/1/',
          cover_url: 'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg' }] }),
          { headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ movies: { list: [{ nm: '让子弹飞', dir: '姜文', rt: '2010-12-16',
          img: same }] } }), { headers: { 'content-type': 'application/json' } });
  try {
    const { results } = await searchCovers('movie', '让子弹飞');
    const withCreator = results.filter((r) => r.creator);
    assert.ok(withCreator.length >= 1, '至少要留下一条带作者的');
    assert.equal(withCreator[0].creator, '姜文');
  } finally { globalThis.fetch = real; }
});
