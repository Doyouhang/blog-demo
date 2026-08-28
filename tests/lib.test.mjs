// studio 纯函数的回归测试。
// 这里每一条几乎都对应一个代码评审揪出来的真实 bug ——
// 它们全在「没有 I/O 的纯函数」里，却能静默毁掉内容库。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, uniqueSlug, scalar, toYaml, buildMarkdown, peekTitle, exifLocalTime, safeSegment,
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
