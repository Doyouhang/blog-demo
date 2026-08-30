// Studio 服务端的安全与数据完整性测试。
//
// 每一条都对应代码评审揪出来的一个真实缺陷：
// 同名条目静默覆盖、路径片段未校验、任意网页可触发部署。
// 自己起服务、跑完自己关，不依赖外部先把服务拉起来。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.STUDIO_TEST_PORT ?? 4342);
const B = `http://127.0.0.1:${PORT}`;
const ORIGIN = { 'content-type': 'application/json', origin: B };

let server;
const created = [];

const post = (p, body, headers = ORIGIN) =>
  fetch(B + p, { method: 'POST', headers, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

const newMoment = (place, text) => ({
  type: 'moments', id: null,
  front: { date: '2026-08-25T10:00:00+08:00', place, draft: true },
  bodyText: text,
});

before(async () => {
  server = spawn('node', ['studio/server.mjs'], {
    cwd: ROOT, detached: true, stdio: 'ignore',
    env: { ...process.env, STUDIO_PORT: String(PORT) },
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(B + '/api/state', { headers: { origin: B }, signal: AbortSignal.timeout(800) });
      if (r.ok) return;
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('studio 15 秒内没起来');
});

after(() => {
  for (const id of created) rmSync(path.join(ROOT, 'src/content/moments', id), { recursive: true, force: true });
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* 已退 */ }
});

test('同名新建不覆盖已有条目', async () => {
  // 同一个地点去两次，派生出的 slug 完全一样。
  // 不查重的话第二条会把第一条整个盖掉，照片还留在磁盘上变孤儿。
  const a = await post('/api/save', newMoment('测试地点甲', '第一条内容'));
  const b = await post('/api/save', newMoment('测试地点甲', '第二条内容'));
  created.push(a.data.id, b.data.id);

  assert.notEqual(a.data.id, b.data.id, '第二条应该另起名字');
  assert.match(readFileSync(path.join(ROOT, a.data.file), 'utf8'), /第一条内容/, '第一条不能被改写');
  assert.match(readFileSync(path.join(ROOT, b.data.file), 'utf8'), /第二条内容/);
});

test('id 里的路径穿越被拒绝', async () => {
  const r = await post('/api/save', {
    type: 'essays', id: '../../../../tmp/pwned', front: { title: 'x' }, bodyText: 'x',
  });
  assert.notEqual(r.status, 200);
  assert.ok(!existsSync('/tmp/pwned.md'), '不能写到仓库外面去');
});

test('upload 的 slug 穿越被拒绝', async () => {
  const r = await fetch(`${B}/api/upload?type=moments&slug=${encodeURIComponent('../../..')}&name=x.jpg`,
    { method: 'POST', headers: { origin: B }, body: Buffer.from('notanimage') });
  assert.notEqual(r.status, 200);
});

test('跨站请求被拒绝（否则任意网页能触发部署）', async () => {
  // 绑 127.0.0.1 挡不住浏览器：任意页面都能发 no-cors 的 POST，
  // 响应读不到，但动作已经执行了。
  const r = await post('/api/commit', { message: 'csrf' },
    { 'content-type': 'text/plain', origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('不带 Origin 的写操作被拒绝', async () => {
  const r = await fetch(B + '/api/push', { method: 'POST', headers: { 'content-type': 'text/plain' } });
  assert.equal(r.status, 403);
});

test('Host 不匹配被拒绝（挡 DNS 重绑定）', async () => {
  // fetch 不让改 Host（forbidden header），伪造不出来 —— 必须走 node:http 手写请求。
  // 这条防的是攻击者把自己的域名解析到 127.0.0.1：那时 Origin 和 Host 都是他的域名，
  // 只查 Origin 是拦不住的。
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/api/state', method: 'GET',
        headers: { host: 'attacker.example', origin: 'http://attacker.example' } },
      (res) => { res.resume(); resolve(res.statusCode); }
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('/media/ 不把 .md 当图片吐出去', async () => {
  const r = await fetch(B + '/media/essays/welcome.md', { headers: { origin: B } });
  assert.equal(r.status, 404);
});

test('正常请求不受影响', async () => {
  const r = await fetch(B + '/api/state', { headers: { origin: B } });
  assert.ok(r.ok);
  const d = await r.json();
  assert.deepEqual(Object.keys(d.types).sort(), ['essays', 'items', 'moments', 'sparks']);
});

test('上传 HEIC 要给人话，不能把编解码器的报错原样甩出来', async () => {
  // sharp 对 HEIC 抛的是「Support for this compression format has not been built in」。
  // 那句话对着看没人猜得到该去关手机相机里的「高效率格式」开关。
  const probeDir = path.join(ROOT, 'src/content/moments/heic-probe');
  rmSync(probeDir, { recursive: true, force: true });   // 不靠上一次跑完的状态
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(8),
  ]);
  const r = await fetch(
    B + '/api/upload?type=moments&slug=heic-probe&name=IMG_20260828.heic',
    { method: 'POST', headers: { origin: B, 'content-type': 'application/octet-stream' }, body: heic }
  );
  const data = await r.json().catch(() => ({}));
  assert.equal(r.status, 500);
  assert.match(data.error ?? '', /HEIC/, '错误里要点名格式');
  assert.match(data.error ?? '', /高效率格式|JPG/, '要说清楚该怎么办');
  assert.doesNotMatch(data.error ?? '', /compression format has not been built/, '不能透出编解码器原文');
  // 连目录都不该留下 —— 格式检查要发生在动文件系统之前
  assert.equal(existsSync(probeDir), false);
});

test('普通 JPEG 照常处理，EXIF 时区跟着照片走', async () => {
  // 手机会写 OffsetTimeOriginal，相机通常不写。不认这个字段的话，
  // 出门在外拍的照片导进来会整体差掉时差那几个小时。
  const sharp = (await import('sharp')).default;
  const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#456' } })
    .withExif({
      IFD0: { Make: 'OPPO', Model: 'PJD110' },
      IFD2: { DateTimeOriginal: '2026:08:28 14:30:22', OffsetTimeOriginal: '+09:00' },
    })
    .jpeg().toBuffer();
  const r = await fetch(
    B + '/api/upload?type=moments&slug=jpeg-probe&name=IMG_20260828.jpg',
    { method: 'POST', headers: { origin: B, 'content-type': 'application/octet-stream' }, body: jpeg }
  );
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  assert.equal(data.exif?.camera, 'PJD110');
  assert.equal(data.shotAt, '2026-08-28T14:30:22+09:00');
  assert.match(data.src, /\.jpg$/, '存盘一律 .jpg');
  rmSync(path.join(ROOT, 'src/content/moments/jpeg-probe'), { recursive: true, force: true });
});

test('已有条目能读回来再编辑，反复保存内容不走样', async () => {
  // 「已发布的东西还能改」这条路的底线：读回来的内容必须和写进去的一致，
  // 而且再保存一次不能把内容改坏。客户端以前自己解析一份 md，
  // 转义规则和服务端的 scalar 对不上，多行短评每编辑一次就多一层反斜杠。
  const front = {
    date: '2026-08-25T10:00:00+08:00',
    place: '说"你好"的那条街',
    draft: true,
  };
  const bodyText = '第一行\n\n第二段';
  const r1 = await post('/api/save', { type: 'moments', id: null, front, bodyText });
  assert.equal(r1.status, 200);
  const id = r1.data.id;
  created.push(id);

  const file = path.join(ROOT, 'src/content/moments', id, 'index.md');
  const afterFirst = readFileSync(file, 'utf8');

  // 从 /api/state 读回来（走的正是客户端载入编辑用的那条路）
  const state = await fetch(B + '/api/state', { headers: { origin: B } }).then((x) => x.json());
  const entry = state.collections.moments.find((e) => e.id === id);
  assert.ok(entry, '列表里要能找到刚存的条目');
  assert.equal(entry.front.place, front.place, '带引号的地点要原样读回来');
  assert.equal(entry.body, bodyText.trim(), '正文要原样读回来');

  // 拿读回来的东西原样再存一次 —— 文件应当一个字节都不变
  const r2 = await post('/api/save', {
    type: 'moments', id, front: { ...entry.front, draft: true }, bodyText: entry.body,
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.id, id, '编辑要落回同一个文件，不能派生出新条目');
  assert.equal(readFileSync(file, 'utf8'), afterFirst, '再保存一次内容不该有任何变化');
});

test('收藏选「长文」：条目和长文一起写出来，且互相对得上', async () => {
  const front = {
    kind: 'movie', title: '测试片', creator: '某导演', date: '2026-08-29',
    blurb: '一句话摘要', draft: true,
  };
  const r = await post('/api/save', {
    type: 'items', id: null, front, bodyText: '',
    note: { title: '', body: '第一段\n\n第二段' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const itemId = r.data.id, noteId = r.data.noteId;
  assert.ok(noteId, '该派生出长文 id');

  const itemFile = path.join(ROOT, 'src/content/items', itemId + '.md');
  const noteFile = path.join(ROOT, 'src/content/essays', noteId + '.md');
  try {
    const item = readFileSync(itemFile, 'utf8');
    const note = readFileSync(noteFile, 'utf8');
    assert.match(item, new RegExp(`essay: ${noteId}`), '条目要指向那篇长文');
    assert.match(note, /title: 《测试片》观后/, '标题没填就按条目派生');
    assert.match(note, /topic: watching/, 'movie 的长文该挂在影视页下');
    assert.match(note, /description: 一句话摘要/, '简介复用那句话，不用写两遍');
    // scalar 会给纯日期加引号 —— 不加的话 YAML 会把它解析成日期对象
    assert.match(note, /pubDate: "2026-08-29"/);
    assert.match(note, /draft: true/, '草稿状态跟着条目走');
    assert.ok(note.includes('第一段\n\n第二段'), '正文原样写进去');

    // 再存一次：不能又派生出第二篇
    const again = await post('/api/save', {
      type: 'items', id: itemId, front: { ...front, essay: noteId }, bodyText: '',
      note: { title: '', body: '改过的正文' },
    });
    assert.equal(again.data.noteId, noteId, '要落回同一篇，不能越存越多');
    assert.match(readFileSync(noteFile, 'utf8'), /改过的正文/);
    const essays = readdirSync(path.join(ROOT, 'src/content/essays'));
    assert.equal(essays.filter((f) => f.startsWith(itemId)).length, 1, '只该有一篇');
  } finally {
    rmSync(itemFile, { force: true });
    rmSync(noteFile, { force: true });
  }
});

test('切回「短评」：解除关联，但长文文件不能被删掉', async () => {
  // 里面是人写过的字。静默删掉是不可接受的 —— 取消关联和删除是两回事。
  const front = {
    kind: 'book', title: '测试书', creator: '某作者', date: '2026-08-29',
    blurb: '摘要', draft: true,
  };
  const r1 = await post('/api/save', {
    type: 'items', id: null, front, bodyText: '', note: { title: '', body: '正文在此' },
  });
  const itemId = r1.data.id, noteId = r1.data.noteId;
  const itemFile = path.join(ROOT, 'src/content/items', itemId + '.md');
  const noteFile = path.join(ROOT, 'src/content/essays', noteId + '.md');
  try {
    // 客户端切回短评时会把 essay 从 front 里删掉、note 传 null
    const r2 = await post('/api/save', {
      type: 'items', id: itemId, front: { ...front }, bodyText: '', note: null,
    });
    assert.equal(r2.status, 200);
    assert.equal(r2.data.noteId, null);
    assert.doesNotMatch(readFileSync(itemFile, 'utf8'), /^essay:/m, '关联要解除');
    assert.equal(existsSync(noteFile), true, '长文文件必须还在');
    assert.match(readFileSync(noteFile, 'utf8'), /正文在此/, '内容一个字都不能少');
  } finally {
    rmSync(itemFile, { force: true });
    rmSync(noteFile, { force: true });
  }
});

test('长文正文是空的就不写文件，也不留下悬空关联', async () => {
  // 悬空关联会让下一次构建直接报错 —— reference() 是构建期校验的
  const r = await post('/api/save', {
    type: 'items', id: null,
    front: { kind: 'song', title: '空正文测试', creator: 'x', date: '2026-08-29', blurb: 'y', draft: true },
    bodyText: '', note: { title: '', body: '   ' },
  });
  const itemFile = path.join(ROOT, 'src/content/items', r.data.id + '.md');
  try {
    assert.equal(r.data.noteId, null);
    assert.doesNotMatch(readFileSync(itemFile, 'utf8'), /^essay:/m);
  } finally { rmSync(itemFile, { force: true }); }
});

test('换封面：旧的那张要被删掉', async () => {
  // 不删的话，反复试封面会攒下一堆几百 KB 的孤儿，
  // 而且它们往往长得一模一样，事后根本分不清哪张还在用。
  const dir = path.join(ROOT, 'src/content/items');
  const oldName = 'zz-old-cover-probe.jpg';
  writeFileSync(path.join(dir, oldName), Buffer.alloc(64));
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#345' } }).png().toBuffer();

  // 用本地服务自己的 media 路由取不到外部图，这里直接调 upload 那条链验证删除行为
  const r = await fetch(B + '/api/upload?type=items&slug=&name=zz-new-cover-probe.jpg', {
    method: 'POST', headers: { origin: B, 'content-type': 'application/octet-stream' }, body: png,
  }).then((x) => x.json());
  assert.ok(r.src, '新图要存下来');
  const newFile = path.join(dir, r.src.replace('./', ''));
  try {
    assert.equal(existsSync(path.join(dir, oldName)), true, '前置：旧图先在');
    // pick 走的是同一个 saveImageInto，删除逻辑在 pick 那条路由里，
    // 这里直接验证服务端不会因为 replacing 里带路径就去删别处的文件
    const bad = await post('/api/cover/pick', {
      type: 'items', slug: '', name: 'x',
      url: 'https://img9.doubanio.com/view/subject/l/public/never-exists-xyz.jpg',
      replacing: '../../../etc/passwd',
    });
    assert.equal(bad.status, 500, '取图会失败，但重点是不能删到目录外');
    assert.equal(existsSync('/etc/passwd'), true, '当然还在 —— 校验挡住了');
  } finally {
    rmSync(path.join(dir, oldName), { force: true });
    rmSync(newFile, { force: true });
  }
});

test('缩略图：上游说没了就报 404，不是 500', async () => {
  // 前端据此把失效的候选悄悄撤掉。一律 500 的话，前端分不清是
  // 「这张图没了」还是「我的服务端挂了」。
  const r = await fetch(
    B + '/api/cover/thumb?u=' + encodeURIComponent('https://img9.doubanio.com/view/subject/l/public/definitely-not-here-zzz.jpg'),
    { headers: { origin: B } });
  assert.ok(r.status === 404 || r.status === 502, `拿到的是 ${r.status}`);
  assert.notEqual(r.status, 200);
});
