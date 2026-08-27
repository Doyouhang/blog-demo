// 跑 Pagefind 生成搜索索引，并把输出收拾干净。
//
// 直接跑 pagefind 会在构建最后甩两条重复的
// 「doesn't support stemming for the language zh-cn」——
// stemming 是英文的词干还原（running→run），中文没有词形变化本来就不需要，
// 这提示对中文站没有实际影响。但它措辞像警告、重复两遍、又落在构建最后一行，
// 每次 build 都要被吓一下。--quiet 压不住它，还会把有用的统计一起吞掉。
//
// 顺带守住两个「搜索静默失效」的坏法。这类坏法最难发现：
// 页面照常上线、搜索框照常显示，只是结果全是错的，没人会注意到。
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/** 数一数构建出了多少个页面，用来判断索引范围对不对 */
function countPages(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'pagefind' || e.name === '_astro') continue;
      n += countPages(p);
    } else if (e.name === 'index.html' || (e.name.endsWith('.html') && statSync(p).size > 0)) {
      n++;
    }
  }
  return n;
}

const res = spawnSync('npx', ['pagefind', '--site', 'dist'], { encoding: 'utf8' });
const out = (res.stdout ?? '') + (res.stderr ?? '');

if (res.status !== 0) {
  console.error(out.trim());
  console.error('[search] pagefind 失败');
  process.exit(res.status ?? 1);
}

const indexed = Number(out.match(/Indexed (\d+) pages/)?.[1] ?? 0);
const words = Number(out.match(/Indexed (\d+) words/)?.[1] ?? 0);
const total = countPages(DIST);

const die = (msg) => {
  console.error(out.trim());
  console.error('\n[search] ' + msg);
  process.exit(1);
};

// 坏法一：标记完全没渲染出来 —— 搜什么都没有
if (indexed === 0) {
  die(
    '索引了 0 个页面，搜索会搜不到任何东西。\n' +
      '         多半是 BaseLayout 的 data-pagefind-body 没渲染出来。'
  );
}

// 坏法二：noIndex 没生效，索引类页面（列表、标签、首页）全被收进来了。
// 后果不是搜不到，而是搜「Astro」第一条弹出标签页而不是那篇文章 ——
// 结果看着有，其实是废的。这个站明确有一批页面不该进索引，
// 所以「索引数 == 总页数」一定是标记写错了。
if (indexed >= total) {
  die(
    `索引了 ${indexed} 个页面，和构建出的 ${total} 个一样多 —— noIndex 没生效。\n` +
      '         检查 BaseLayout：不能写成 data-pagefind-body={!noIndex} 或 {noIndex ? false : true}，\n' +
      '         data-* 不是布尔属性，false 会渲染成字符串 "false"，属性依然存在，\n' +
      '         而 Pagefind 只看属性存不存在。必须传 undefined 才会整个属性都不输出。'
  );
}

console.log(`[search] 索引 ${indexed}/${total} 个页面 / ${words} 个词`);
