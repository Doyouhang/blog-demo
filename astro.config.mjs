import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages 部署说明：
// - 项目页：仓库 blog-demo → 地址 https://<用户名>.github.io/blog-demo/
//   构建前设置 SITE_BASE=/blog-demo/（deploy.sh / Actions 已自动设置）
// - 用户页：仓库名为 <用户名>.github.io → base 保持 '/'
// 本地开发不设置 SITE_BASE，默认 '/'，预览在根路径
const BASE = process.env.SITE_BASE || '/';

export default defineConfig({
  base: BASE,
  site: 'https://doyouhang.github.io', // 你的 GitHub Pages 地址
  outDir: 'dist',
  integrations: [sitemap()],
});
