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
  markdown: {
    shikiConfig: { theme: 'github-dark', transformers: [raiseCommentContrast] },
  },
  site: 'https://doyouhang.github.io', // 你的 GitHub Pages 地址
  outDir: 'dist',
  integrations: [sitemap()],
});
