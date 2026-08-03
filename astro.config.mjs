import { defineConfig } from 'astro/config';

// Gitee Pages 部署说明：
// - 用户页：仓库名为 <用户名>.gitee.io，部署在根路径，base 保持 '/'
// - 项目页：仓库名为普通名，部署在 /<仓库名>/ 下，构建前设置 GITEE_BASE=/<仓库名>/
const BASE = process.env.GITEE_BASE || '/';

export default defineConfig({
  base: BASE,
  site: 'https://doyouhang.gitee.io', // 你的 Gitee Pages 地址
  outDir: 'dist',
});
