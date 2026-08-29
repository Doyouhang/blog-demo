// Studio 服务端的安全与数据完整性测试。
//
// 每一条都对应代码评审揪出来的一个真实缺陷：
// 同名条目静默覆盖、路径片段未校验、任意网页可触发部署。
// 自己起服务、跑完自己关，不依赖外部先把服务拉起来。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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
  assert.deepEqual(Object.keys(d.types).sort(), ['essays', 'items', 'moments']);
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
