// 衬线字体子集自托管：从 Noto Serif SC 可变字重里子集出一个 woff2，交给 Vite 打包。
//
// 只收**真正走衬线的字**。衬线用在哪几处见 global.css 里 var(--font-display) 的
// 出现位置：标题 h1-h3、品牌名、首页那句导语、prose 的 h2、朱红印章、引用块。
// 正文是无衬线的 —— 早先按 src/ 全文收字（1901 个），等于白扛五倍体积：
// 1901 字要 829KB×2，384 字只要 150KB，而且一个文件覆盖 400-700 两个字重。
//
// 收窄的风险是漏字：将来谁把衬线用到别处，那些字不在子集里就会逐字回退到宋体，
// 同一行里两种字体，而且不报任何错。所以这里把字表也写出去，
// tests/smoke.mjs 有一条断言拿真实渲染结果去比对 —— 漏了会红。
//
// 基础字体缓存到 ~/.cache/blog-demo-fonts（只下一次）。
// 失败不阻断构建：仓库里提交着上一版字体，最坏情况回退系统衬线。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(os.homedir(), '.cache', 'blog-demo-fonts');
const SRC_NAME = 'NotoSerifSC-VF.ttf';
const SRC_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf';
const OUT = path.join(ROOT, 'src/fonts/paper-serif.woff2');
const CHARS = path.join(ROOT, 'src/fonts/subset.txt');

/** 扫 src/ 下的 md 和 astro，只挑会落到衬线上的那几类文本 */
async function collectSerifText() {
  let all = '';
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(md|astro|ts)$/.test(e.name)) all += await fs.readFile(p, 'utf8') + '\n';
    }
  };
  await walk(path.join(ROOT, 'src'));

  const grab = (re) => [...all.matchAll(re)].map((m) => m[1]).join('');
  const parts = [
    // 基础：拉丁字母、数字、常用符号、中文标点
    '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ',
    '，。、；：？！…—·《》〈〉「」『』【】（）＊＃＆％＋－／＝～￥',
    '迩',                                              // 朱红印章
    // 印章类元素（读毕「阅」印、「查无此档」大印）是写在 astro 模板里的 span/div，
    // 不在 <p> 也不是带引号的字符串字面量 —— 7f8d288 加「阅」印时就是从这里漏的，
    // 冒烟测试「衬线子集没漏字」当场抓了出来
    grab(/<(?:span|div)[^>]*class="[^"]*(?:seal|stamp)[^"]*"[^>]*>([^<]{1,60})<\/(?:span|div)>/g),
    grab(/^#{1,3} (.+)$/gm),                           // md 一到三级标题
    grab(/^> ?(.*)$/gm),                               // md 引用块（走衬线）
    grab(/^title: (.+)$/gm),                           // frontmatter 标题
    grab(/<h[123][^>]*>([^<]{1,160})<\/h[123]>/g),     // astro 里的标题字面量
    grab(/<blockquote[^>]*>([^<]{1,240})<\/blockquote>/g),
    grab(/(?:title|lead|eyebrow)=["{`]([^"}`]{1,160})/g), // PageHeader 的三个槽
    grab(/<p>([^<]{1,160})<\/p>/g),                    // 首页导语那类字面段落
    // 代码拼出来的文字没有字面量可扫。「2026 年 8 月」这种月份标题就是
    // cstYearMonth() 现拼的，只扫模板会漏掉「月」——
    // 冒烟测试那条「衬线子集没漏字」就是这么抓出来的。
    // 所以把 ts / astro 里带中文的字符串字面量也收进来，再兜一层常用量词。
    grab(/[`'\"]([^`'\"\n]*[\u4e00-\u9fa5][^`'\"\n]*)[`'\"]/g),
    '年月日时分秒条本部张篇个第共约',
  ];
  return [...new Set(parts.join(''))].filter((c) => c !== '\n' && c !== '\r').join('');
}

const text = await collectSerifText();
await fs.mkdir(CACHE, { recursive: true });
await fs.mkdir(path.dirname(OUT), { recursive: true });

try {
  const base = path.join(CACHE, SRC_NAME);
  if (!(await fs.stat(base).catch(() => null))) {
    process.stdout.write('[fonts] 下载 Noto Serif SC 可变字重…');
    const res = await fetch(SRC_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await fs.writeFile(base, Buffer.from(await res.arrayBuffer()));
    console.log(' 完成');
  }
  // 保留 wght 轴 400-700：一个文件同时供正常和加粗用，比两个静态子集还小
  const buf = await subsetFont(await fs.readFile(base), text, {
    targetFormat: 'woff2',
    variationAxes: { wght: { min: 400, max: 700 } },
  });
  await fs.writeFile(OUT, buf);
  await fs.writeFile(CHARS, text, 'utf8');
  console.log(`[fonts] paper-serif.woff2 ${(buf.length / 1024).toFixed(0)}KB（${text.length} 字，wght 400-700）`);
} catch (e) {
  console.warn(`[fonts] 跳过：${String(e).slice(0, 120)}（沿用仓库里已提交的那版）`);
}
