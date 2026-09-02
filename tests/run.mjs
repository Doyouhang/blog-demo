// 冒烟测试的入口：自己起 preview、跑完自己关掉。
// preview 的起停逻辑在 scripts/preview-server.mjs，视觉快照共用同一份。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPreview } from '../scripts/preview-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT ?? 4321);

const { base, stop, isListening } = await startPreview({
  port: PORT, label: 'smoke', root: ROOT, portEnv: 'SMOKE_PORT',
});

const res = spawnSync('node', [path.join(ROOT, 'tests/smoke.mjs')], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, SMOKE_BASE: base },
});
stop();

// 确认端口真的放开了。停不掉要说出来，不然下次跑会撞上自己留下的进程，
// 而报出来的错会指向完全不相干的地方。
await new Promise((r) => setTimeout(r, 500));
if (await isListening()) {
  console.error(`[smoke] 警告：preview 没停干净，端口 ${PORT} 仍被占用。`);
  console.error('        手动清理：pkill -f "astro[ ]preview"');
}
process.exit(res.status ?? 1);
