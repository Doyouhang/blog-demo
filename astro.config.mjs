import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages 部署说明：
// - 项目页：仓库 blog-demo → 地址 https://<用户名>.github.io/blog-demo/
//   构建前设置 SITE_BASE=/blog-demo/（deploy.sh / Actions 已自动设置）
// - 用户页：仓库名为 <用户名>.github.io → base 保持 '/'
// 本地开发不设置 SITE_BASE，默认 '/'，预览在根路径
const BASE = process.env.SITE_BASE || '/';

// 代码高亮的注释色。github-dark 自带的 #6A737D 压在 #24292e 上只有 3.05，
// 而同一个代码块里其他 token 都在 5.5 以上 —— 偏偏注释是最需要读的那行。
// 在构建期把这个颜色换掉，比在 CSS 里用 !important 盖内联样式干净。
// 换主题会让这条静默失效，所以 tests/smoke.mjs 有一条断言直接量代码块里
// 每一种颜色的对比度，不依赖颜色值写死在这里。
const raiseCommentContrast = {
  name: 'raise-comment-contrast',
  span(node) {
    const s = node.properties?.style;
    if (typeof s === 'string' && s.toUpperCase().includes('#6A737D')) {
      node.properties.style = s.replace(/#6a737d/gi, '#8B949E');   // 3.05 → 4.77
    }
  },
};

export default defineConfig({
  base: BASE,
  // 「下厨」改名成「美食」，路由跟着从 /interests/cooking/ 挪到 /interests/food/。
  // 静态站没有服务端发 301，Astro 会生成一个跳转页 —— 老链接不至于变成 404。
  //
  // 键（来源路径）Astro 会自己补 base，值（目标地址）**不会** ——
  // 它原样写进 meta refresh。所以这里必须手动带上 base，否则项目页上
  // 会跳到 https://用户名.github.io/interests/food/，那是另一个站的 404。
  // 本地默认 base='/'，两种写法都对，这个错只在线上出现。第五次栽在同一处了。
  // 带不带尾斜杠会被归一成同一条路由，写两遍算重复定义。
  redirects: { '/interests/cooking': `${BASE.replace(/\/$/, '')}/interests/food/` },
  markdown: {
    shikiConfig: { theme: 'github-dark', transformers: [raiseCommentContrast] },
  },
  site: 'https://doyouhang.github.io', // 你的 GitHub Pages 地址
  outDir: 'dist',
  integrations: [sitemap()],
});
