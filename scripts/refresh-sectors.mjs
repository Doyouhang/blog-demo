// 刷新行业板块清单 → src/data/sectors.list.json
//
// 手动跑：npm run refresh:sectors
//
// 为什么单独拎出来、不放进构建流程：这一步走 clist 分页接口，限流极严 ——
// 实测触发之后连打三分钟都不恢复，脚本内重试根本跨不过那个窗口。
// 而行业板块的构成半年也未必动一次，没道理每次构建都去翻五页。
// 构建期改用 ulist.np 按这份清单批量取行情，一次请求拿全，那个接口不限流。
//
// 什么时候需要跑：页面上板块数明显变少、或东财调整了行业分类。平时不用管。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { toArray, reason } from './market-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '../src/data/sectors.list.json');

const TIMEOUT_MS = 20000;
const PAGE_GAP_MS = 1500;
const MIN_EXPECTED = 400; // 实际约 496 个；少于这个数说明被限流截断了，不能覆盖好清单

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 东财的 push2 有多个节点，限流是分开算的。清单只要板块代码和名称、
// 不需要实时行情，所以延迟节点完全够用 —— 主节点被限流时正好拿它兜底。
const HOSTS = ['push2', 'push2delay'];
const pageUrl = (host, pn) =>
  `https://${host}.eastmoney.com/api/qt/clist/get` +
  `?pn=${pn}&pz=100&po=1&fid=f3&fs=m:90+t:2&fields=f12,f13,f14&fltt=2`;

let host = null;
const all = [];
for (const h of HOSTS) {
  try {
    all.push(...toArray(await getJson(pageUrl(h, 1))));
    host = h;
    break;
  } catch (e) {
    console.warn(`[sectors] 节点 ${h} 取不到：${reason(e)}`);
  }
}
if (!host) {
  console.error('[sectors] 所有节点都取不到，清单未改动。等几分钟再跑一次。');
  process.exit(1);
}
console.log(`[sectors] 用节点 ${host}，第 1 页 ${all.length} 个`);

// 板块总数会变，别写死页数：翻到取不出整页为止
for (let pn = 2; pn <= 8 && all.length % 100 === 0; pn++) {
  await sleep(PAGE_GAP_MS);
  const page = toArray(await getJson(pageUrl(host, pn)));
  all.push(...page);
  console.log(`[sectors] 第 ${pn} 页 ${page.length} 个，累计 ${all.length}`);
  if (page.length < 100) break;
}

const list = all
  .map((d) => ({ secid: `${d.f13}.${d.f12}`, code: String(d.f12), name: String(d.f14) }))
  .filter((s) => s.code && s.name);

// 宁可保留旧清单也不写一份残缺的：清单被截断的话，构建期算出来的
// 「多少个板块收红」会凭空少掉一截，而页面看不出任何异常。
if (list.length < MIN_EXPECTED) {
  console.error(`[sectors] 只拿到 ${list.length} 个（期望 ≥ ${MIN_EXPECTED}），多半是被限流截断了。`);
  console.error('[sectors] 清单未改动。等几分钟再跑一次。');
  process.exit(1);
}

// 按 code 排序，让每次刷新的 diff 只反映真正的增删，而不是接口返回顺序的抖动
list.sort((a, b) => a.code.localeCompare(b.code));
writeFileSync(outPath, JSON.stringify(list, null, 2) + '\n', 'utf8');
console.log(`[sectors] 已写入 ${list.length} 个行业板块 → src/data/sectors.list.json`);
