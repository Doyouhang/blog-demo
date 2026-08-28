// 冒烟测试的入口：自己起 preview、跑完自己关掉。
//
// 为什么要包一层：手动「后台起 preview + 跑测试 + pkill」踩过三次同一个坑 ——
// 4321 被别的进程（上次没退干净的 astro、编辑器的内置服务）占着时，
// astro 会**静默顺延到 4322/4323**，而测试还在连 4321。
// 结果是连到了完全不相干的服务，报出来的错和真实问题毫无关系。
// 这里显式指定端口，被占就直接报错，不猜。
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT ?? 4321);
// 站点可能挂在子路径下（GitHub Pages 项目页 SITE_BASE=/blog-demo/）。
// 探测地址和传给 smoke 的地址都必须带上它 —— 去探 http://localhost:4321/
// 在 base 不是 / 的时候恒返回 404，等于永远等不到「起来了」。
// 本地不设 SITE_BASE、base 就是 /，所以这个坑本地必然测不出来，只在 CI 上炸。
const BASE_PATH = (process.env.SITE_BASE ?? '/').replace(/\/+$/, '');
const BASE = `http://localhost:${PORT}${BASE_PATH}`;

// 两种语义要分开，混用会把「端口被别人占着」和「我们的站还没起来」搅在一起：
//   listening —— 端口上有东西在应答就算，404 也算（判断端口是否被占）
//   ready     —— 我们的站真的能打开（要 2xx）
const request = async () => {
  try {
    return await fetch(BASE + '/', { signal: AbortSignal.timeout(1500) });
  } catch { return null; }
};
const listening = async () => (await request()) !== null;
const ready = async () => (await request())?.ok === true;

// 端口已经被占：可能是上次没退干净的 astro，也可能是别人的服务。
// 不管是谁，都不能假设它就是我们要测的站。
if (await listening()) {
  console.error(`[smoke] 端口 ${PORT} 已被占用。`);
  console.error('        如果是上次没退干净的 astro：pkill -f "astro[ ]preview"');
  console.error('        如果是别的服务：SMOKE_PORT=4351 npm run test:smoke  （4331 是 studio 的，别用）');
  process.exit(1);
}

console.log(`[smoke] 启动 preview（端口 ${PORT}）…`);
// detached 让 preview 成为独立进程组的组长。
// 不这么做的话，kill 只杀得掉 npx，底下真正监听端口的 astro 进程活得好好的 ——
// 每跑一次测试就漏一个，下次再跑端口就被自己占了。这个坑踩过三次。
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  // 负数 pid = 杀整个进程组，npx 和它底下的 astro 一起走
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* 已经退了 */ }
};
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  if (await ready()) break;
  if (server.exitCode !== null) {
    console.error('[smoke] preview 启动失败：\n' + serverLog.trim());
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 400));
}
if (!(await ready())) {
  console.error(`[smoke] preview 30 秒内没在 ${BASE}/ 上就绪：\n` + serverLog.trim());
  stop();
  process.exit(1);
}

const res = spawnSync('node', [path.join(ROOT, 'tests/smoke.mjs')], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, SMOKE_BASE: BASE },
});
stop();

// 确认端口真的放开了。停不掉要说出来，不然下次跑会撞上自己留下的进程，
// 而报出来的错会指向完全不相干的地方。
await new Promise((r) => setTimeout(r, 500));
if (await listening()) {
  console.error(`[smoke] 警告：preview 没停干净，端口 ${PORT} 仍被占用。`);
  console.error('        手动清理：pkill -f "astro[ ]preview"');
}
process.exit(res.status ?? 1);
