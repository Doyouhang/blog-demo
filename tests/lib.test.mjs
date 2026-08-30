// studio 纯函数的回归测试。
// 这里每一条几乎都对应一个代码评审揪出来的真实 bug ——
// 它们全在「没有 I/O 的纯函数」里，却能静默毁掉内容库。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, uniqueSlug, scalar, toYaml, buildMarkdown, peekTitle, exifLocalTime, safeSegment,
  parseExifOffset, sniffIsoBmff, unquote, parseFront, parsePhotos,
  TOPIC_BY_KIND, noteTitleFor, noteSlugFor,
} from '../studio/lib.mjs';

test('scalar: 多行文本必须转义，不能产出裸换行', () => {
  // 「一句话短评」和「简介」都是 textarea，回车拦不住。
  // 裸换行会让 frontmatter 直接变成非法 YAML，构建挂掉；
  // 落进引号里也不行 —— YAML 会把它折成空格，内容悄悄变样。
  const out = scalar('第一行\n第二行');
  assert.equal(out, '"第一行\\n第二行"');
  assert.ok(!out.includes('\n'), '序列化结果里不能有真实换行');
});

test('scalar: 冒号加空格要加引号，普通串不加', () => {
  assert.equal(scalar('讲了一件事: 后面'), '"讲了一件事: 后面"');
  assert.equal(scalar('ILCE-7CM2'), 'ILCE-7CM2');      // 手改文件时不该满屏引号
  assert.equal(scalar('f/1.8'), 'f/1.8');
  assert.equal(scalar('1/125s'), '1/125s');
});

test('scalar: 会被误解析成别的类型时才加引号', () => {
  assert.equal(scalar('2026-08-25T18:42:07+08:00'), '"2026-08-25T18:42:07+08:00"'); // 否则成 timestamp
  assert.equal(scalar('true'), '"true"');
  assert.equal(scalar('42'), '"42"');
  assert.equal(scalar('上海 · 武康路'), '上海 · 武康路');
});

test('scalar: 反斜杠和引号都要转义', () => {
  assert.equal(scalar('a\\b: c'), '"a\\\\b: c"');
  assert.equal(scalar('说"你好": 他'), '"说\\"你好\\": 他"');
});

test('toYaml: 空字符串字段要保留，不能被过滤掉', () => {
  // 新上传的照片 alt 默认是空串。过滤掉的话生成的 md 缺 alt 字段，
  // 而 schema 里 alt 是必填 —— 拖三张图点保存，仓库就构建不了了。
  const out = toYaml({ src: './a.jpg', alt: '' }, 0);
  assert.match(out, /alt: ""/);
});

test('buildMarkdown: photos 数组结构合法且保住 EXIF', () => {
  const md = buildMarkdown(
    {
      date: '2026-08-25T18:42:07+08:00',
      photos: [{ src: './a.jpg', alt: '', exif: { camera: 'ILCE-7CM2', iso: 400 } }],
      draft: true,
    },
    '正文'
  );
  assert.match(md, /^photos:\n  - src: \.\/a\.jpg$/m);
  assert.match(md, /^      camera: ILCE-7CM2$/m);
  assert.match(md, /^      iso: 400$/m);
  assert.match(md, /alt: ""/);
});

test('slugify: 假名和谚文不该被抹掉', () => {
  // 示例内容里就有一首竹内まりや的歌，原来的实现会把它整条抹成 untitled
  assert.equal(slugify('竹内まりや'), '竹内まりや');
  assert.equal(slugify('한국어'), '한국어');
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('!!!???'), 'untitled');
  assert.ok(!slugify('a'.repeat(80)).endsWith('-'), '截断后不该留下尾部连字符');
});

test('uniqueSlug: 同名条目必须让路，不能覆盖', () => {
  // 同一个地点去两次、或同一天两条没写地点的动态，派生出的 slug 一模一样。
  // 不查重的话第二条会把第一条整个盖掉，照片还留在磁盘上变孤儿。
  const taken = new Set(['上海-武康路', '上海-武康路-2']);
  assert.equal(uniqueSlug('上海-武康路', (s) => taken.has(s)), '上海-武康路-3');
  assert.equal(uniqueSlug('全新的', (s) => taken.has(s)), '全新的');
});

test('safeSegment: 挡住路径穿越', () => {
  assert.equal(safeSegment('../../../../home/hx/.ssh/config'), null);
  assert.equal(safeSegment('a/b'), null);
  assert.equal(safeSegment('..'), null);
  assert.equal(safeSegment(''), null);
  assert.equal(safeSegment('2026-08-25-citywalk'), '2026-08-25-citywalk');
});

test('exifLocalTime: 半小时时区和负偏移都要对', () => {
  assert.equal(exifLocalTime('2026:08:25 18:42:07', 480), '2026-08-25T18:42:07+08:00');
  assert.equal(exifLocalTime('2026:08:25 18:42:07', 330), '2026-08-25T18:42:07+05:30');
  assert.equal(exifLocalTime('2026:08:25 18:42:07', -210), '2026-08-25T18:42:07-03:30');
  assert.equal(exifLocalTime('2026:08:25 18:42:07', -300), '2026-08-25T18:42:07-05:00');
  assert.equal(exifLocalTime('没有这个字段'), null);
});

test('peekTitle: moments 靠日期区分，不是只看地点', () => {
  const a = 'date: "2026-08-24T16:30:00+08:00"\nplace: 上海 · 武康路\n';
  const b = 'date: "2026-08-26T10:00:00+08:00"\nplace: 上海 · 武康路\n';
  assert.notEqual(peekTitle(a, 'x'), peekTitle(b, 'y'), '同一地点的两条不能显示成一样');
  assert.equal(peekTitle('title: 万历十五年\n', 'x'), '万历十五年');
});

test('parseExifOffset: 认得手机写的时区偏移', () => {
  assert.equal(parseExifOffset('+09:00'), 540);
  assert.equal(parseExifOffset('+08:00'), 480);
  assert.equal(parseExifOffset('-05:00'), -300);
  assert.equal(parseExifOffset('+0530'), 330);   // 有些机型不带冒号
  assert.equal(parseExifOffset('+00:00'), 0);
});

test('parseExifOffset: 认不出来要返回 null 而不是 0', () => {
  // 返回 0 会被当成 UTC，照片时间整体差八小时；返回 null 才能回退到本机时区。
  assert.equal(parseExifOffset(undefined), null);
  assert.equal(parseExifOffset(''), null);
  assert.equal(parseExifOffset('随便什么'), null);
  assert.equal(parseExifOffset('+99:00'), null);  // 现实中最大 +14:00
});

test('exifLocalTime: 给了偏移就按偏移算，不看本机时区', () => {
  // 出门在外拍的照片：EXIF 里的墙上时间是当地的，时区也是当地的。
  // 忽略 OffsetTimeOriginal 的话，回家一导入就整体差掉时差。
  assert.equal(exifLocalTime('2026:08:28 14:30:22', 9 * 60), '2026-08-28T14:30:22+09:00');
  assert.equal(exifLocalTime('2026:08:28 14:30:22', -5 * 60), '2026-08-28T14:30:22-05:00');
  assert.equal(exifLocalTime('2026:08:28 14:30:22', 0), '2026-08-28T14:30:22+00:00');
});

test('sniffIsoBmff: 认出 HEIC 和 AVIF，放过普通图片', () => {
  // sharp 的 format 表会说 heif「可读」，但预编译包没带 HEVC 解码插件，
  // 真喂进去抛的是「Support for this compression format has not been built in」，
  // 对着那句话没人猜得到该去关手机相机里的「高效率格式」。
  const bmff = (brand) => Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(8),
  ]);
  assert.equal(sniffIsoBmff(bmff('heic')), 'HEIC/HEIF');
  assert.equal(sniffIsoBmff(bmff('mif1')), 'HEIC/HEIF');
  assert.equal(sniffIsoBmff(bmff('avif')), 'AVIF');
  // JPEG / PNG 必须放行
  assert.equal(sniffIsoBmff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  assert.equal(sniffIsoBmff(Buffer.from('\x89PNG\r\n\x1a\n' + 'x'.repeat(8), 'latin1')), null);
  assert.equal(sniffIsoBmff(Buffer.from([1, 2, 3])), null);   // 太短不能越界
  assert.equal(sniffIsoBmff(null), null);
});

test('unquote: 是 scalar 的逆运算，三样转义都要还原', () => {
  assert.equal(unquote('"第一行\\n第二行"'), '第一行\n第二行');
  assert.equal(unquote('"说\\"你好\\""'), '说"你好"');
  assert.equal(unquote('"C:\\\\Users"'), 'C:\\Users');
  assert.equal(unquote('没有引号就原样'), '没有引号就原样');
});

test('unquote: 转义的反斜杠后跟 n，不能被当成换行', () => {
  // 分别 replace 会踩这个坑：先还原 \\ 得到 \n，再还原 \n 就变成了换行。
  // 必须单次扫描。
  assert.equal(unquote('"C:\\\\next"'), 'C:\\next');
  assert.ok(!unquote('"C:\\\\next"').includes('\n'), '不该出现真换行');
});

test('往返：写出去再读回来，标量内容一模一样', () => {
  const front = {
    title: '说"你好"的那本书',
    blurb: '第一行\n第二行',
    path: 'C:\\Users\\me',
    tags: ['科幻', '值得重读'],
  };
  const { front: back, body } = parseFront(buildMarkdown(front, '正文内容'));
  assert.equal(back.title, front.title);
  assert.equal(back.blurb, front.blurb, '换行必须还原成真换行');
  assert.equal(back.path, front.path, '反斜杠不能变多');
  assert.deepEqual(back.tags, front.tags);
  assert.equal(body, '正文内容');
});

test('往返幂等：反复编辑同一条，内容不能越改越歪', () => {
  // 这条是「已发布的东西还能再编辑」的底线。
  // unquote 少还原一样转义的话，每保存一次就多一层反斜杠，
  // 而页面上、文件里都看不出哪里不对，等发现时已经积了好几层。
  const front = { title: '带"引号"和\\反斜杠', blurb: '多行\n短评' };
  const once = buildMarkdown(parseFront(buildMarkdown(front, '正文')).front, '正文');
  const twice = buildMarkdown(parseFront(once).front, '正文');
  const thrice = buildMarkdown(parseFront(twice).front, '正文');
  assert.equal(twice, once, '第二次编辑后应与第一次完全相同');
  assert.equal(thrice, once, '第三次也是');
});

test('parseFront: photos 那种对象数组不交给浅解析器', () => {
  const md = buildMarkdown(
    { date: '2026-08-25', photos: [{ src: './a.jpg', alt: '街角', exif: { camera: 'PJD110' } }] },
    ''
  );
  const { front } = parseFront(md);
  assert.equal(front.date, '2026-08-25');
  assert.equal(front.photos, undefined, 'photos 该留给 parsePhotos');
  const photos = parsePhotos(md);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].src, './a.jpg');
  assert.equal(photos[0].alt, '街角');
  assert.equal(photos[0].exif.camera, 'PJD110', 'EXIF 要原样保住');
});

test('parsePhotos: alt 里有引号和换行也要能读回来', () => {
  const md = buildMarkdown(
    { photos: [{ src: './b.jpg', alt: '写着"营业中"的招牌' }] },
    ''
  );
  assert.equal(parsePhotos(md)[0].alt, '写着"营业中"的招牌');
});

test('parseFront: 认得手写的行内数组，别把标签压成一个字符串', () => {
  // 仓库里原有的文章是手写的，标签写成 tags: ['随笔', '建站']；
  // buildMarkdown 写出来的却是多行 - 形式。只认后者的话，
  // 用编辑器打开一篇手写的旧文章再保存，标签就变成了一行字符串，
  // 页面上那篇文章的标签云当场少掉两个，而 md 看着还挺正常。
  const md = `---\ntitle: 建站\ntags: ['随笔', '建站']\ndraft: false\n---\n\n正文\n`;
  const { front } = parseFront(md);
  assert.deepEqual(front.tags, ['随笔', '建站']);
  assert.equal(front.title, '建站');
});

test('parseFront: 行内数组的双引号和空数组', () => {
  assert.deepEqual(parseFront('---\ntags: ["a", "b"]\n---\n').front.tags, ['a', 'b']);
  assert.deepEqual(parseFront('---\ntags: []\n---\n').front.tags, []);
});

test('往返：手写的行内数组读进来再写出去，内容不丢', () => {
  const md = `---\ntitle: 建站\ntags: ['随笔', '建站']\n---\n\n正文\n`;
  const { front, body } = parseFront(md);
  const { front: back } = parseFront(buildMarkdown(front, body));
  assert.deepEqual(back.tags, ['随笔', '建站'], '过一轮编辑器不能丢标签');
});

test('长文归属跟着条目类型走', () => {
  // 映射错了的话，写的影评会跑到读书页的侧栏里去 —— 页面照常渲染，只是挂错了地方
  assert.equal(TOPIC_BY_KIND.movie, 'watching');
  assert.equal(TOPIC_BY_KIND.book, 'reading');
  assert.equal(TOPIC_BY_KIND.song, 'music');
});

test('长文标题：没填就派生，填了就用填的', () => {
  assert.equal(noteTitleFor('movie', '奥德赛'), '《奥德赛》观后');
  assert.equal(noteTitleFor('book', '万历十五年'), '《万历十五年》读后');
  assert.equal(noteTitleFor('song', '范特西'), '《范特西》听后');
  assert.equal(noteTitleFor('movie', '奥德赛', '关于回家这件事'), '关于回家这件事');
  assert.equal(noteTitleFor('movie', '奥德赛', '   '), '《奥德赛》观后', '全是空格等于没填');
});

test('长文标题：条目没标题也不能派生出空标题', () => {
  // 空标题会让 essays 的 Zod 校验在构建期报错，而错误信息指向的是那个文件，
  // 不是这里 —— 排查起来会绕一圈
  assert.equal(noteTitleFor('movie', ''), '《无题》观后');
  assert.equal(noteTitleFor('movie', undefined), '《无题》观后');
  assert.equal(noteTitleFor('什么类型', '某某'), '《某某》手记');
});

test('长文文件名：已经关联过的要沿用，不能每次都派生新的', () => {
  // 不沿用的话，每保存一次就多出一篇孤儿长文，同一条内容散成好几份
  assert.equal(noteSlugFor('ao-de-sai', null), 'ao-de-sai-note');
  assert.equal(noteSlugFor('ao-de-sai', ''), 'ao-de-sai-note');
  assert.equal(noteSlugFor('ao-de-sai', 'my-custom-essay'), 'my-custom-essay');
});
