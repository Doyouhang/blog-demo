// 起 astro preview、等它真的能打开、跑完关干净。smoke 和视觉快照共用这一份。
//
// 为什么要包一层：手动「后台起 preview + 跑测试 + pkill」踩过三次同一个坑 ——
// 端口被别的进程（上次没退干净的 astro、编辑器的内置服务）占着时，
// astro 会**静默顺延到下一个端口**，而测试还在连原来那个。
// 结果是连到了完全不相干的服务，报出来的错和真实问题毫无关系。
// 所以：显式指定端口，被占就直接报错，不猜。
//
// 为什么要抽成公共的：原本 smoke 和视觉快照各写了一份，视觉快照那份是弱化版 ——
// stdio 写成 'ignore'，preview 的输出直接扔掉，也不看子进程是不是已经退了。
// 结果 CI 上失败时只留下一句「preview 没起来」，一个字的原因都没有，只能靠猜。
// 同一件事只留一份实现，而且是被验证过的那份。
import { spawn } from 'node:child_process';
import { at } from './site-base.mjs';

// 两种语义要分开，混用会把「端口被别人占着」和「我们的站还没起来」搅在一起：
//   listening —— 端口上有东西在应答就算，404 也算（判断端口是否被占）
//   ready     —— 我们的站真的能打开（要 2xx）
const probe = async (url) => {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(1500) });
  } catch { return null; }
};

/**
 * 起 preview 并等到能打开为止。起不来就打印诊断并 exit(1) ——
 * 两个调用方都是命令行脚本，行为一致，不必各自再包一层。
 *
 * @param {object} o
 * @param {number} o.port      监听端口
 * @param {string} o.label     日志前缀，比如 smoke / visual
 * @param {string} o.root      仓库根目录
 * @param {string} o.portEnv   换端口用的环境变量名，出错时提示给人看
 * @param {number} [o.timeoutMs]
 * @returns {Promise<{ base: string, stop: () => void, isListening: () => Promise<boolean> }>}
 */
export async function startPreview({ port, label, root, portEnv, timeoutMs = 30000 }) {
  // base 只有 scripts/site-base.mjs 一处说了算，那里写着这个坑的来龙去脉。
  //
  // 主机名必须用 localhost，不能写死 127.0.0.1。astro preview 是 listen 在
  // 「localhost」这个名字上的，绑到哪个地址取决于机器怎么解析它。
  // 本机 localhost -> 127.0.0.1，两种写法都通；但 CI 上 localhost 可能先解析到
  // ::1，preview 就只监听 IPv6 回环，这时候连 127.0.0.1 永远是 ECONNREFUSED。
  // 视觉快照就是这么挂的：smoke 用 localhost 探测所以是绿的，视觉快照写死了
  // 127.0.0.1，在 CI 上等满超时报「preview 没起来」，本地怎么跑都复现不了。
  // 两边用同一个名字，让解析结果自然一致。
  const base = at(`http://localhost:${port}`);
  const isListening = async () => (await probe(base + '/')) !== null;
  const isReady = async () => (await probe(base + '/'))?.ok === true;

  if (await isListening()) {
    console.error(`[${label}] 端口 ${port} 已被占用。`);
    console.error('        如果是上次没退干净的 astro：pkill -f "astro[ ]preview"');
    console.error(`        如果是别的服务：${portEnv}=4351 重跑  （4331 是 studio 的，别用）`);
    process.exit(1);
  }

  console.log(`[${label}] 启动 preview（端口 ${port}）…`);
  // detached 让 preview 成为独立进程组的组长。
  // 不这么做的话，kill 只杀得掉 npx，底下真正监听端口的 astro 进程活得好好的 ——
  // 每跑一次测试就漏一个，下次再跑端口就被自己占了。这个坑踩过三次。
  const server = spawn('npx', ['astro', 'preview', '--port', String(port)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  // 下面两行是 CI 上唯一能拿到的线索，别再改回 stdio: 'ignore'
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

  const said = () => serverLog.trim() || '（preview 没有任何输出）';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReady()) return { base, stop, isListening };
    // 子进程已经退了就别再等满超时，它的输出里通常直接写着原因
    if (server.exitCode !== null) {
      console.error(`[${label}] preview 启动失败（退出码 ${server.exitCode}）：\n` + said());
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`[${label}] preview ${timeoutMs / 1000} 秒内没在 ${base}/ 上就绪：\n` + said());
  stop();
  process.exit(1);
}
