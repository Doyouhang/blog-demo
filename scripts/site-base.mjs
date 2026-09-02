// 站点挂在哪个路径下，只有这一处说了算。
//
// GitHub Pages 项目页的 base 是 /blog-demo/，而本地默认是 /。
// 任何把地址写死成根路径的探测，在本地必绿、只在 CI 上炸 ——
// 这个仓库为它付过四次代价：
//   1. tests/run.mjs 探 / 等 preview 就绪，CI 上恒 404，报成「preview 没起来」
//   2. scripts/visual-shot.mjs 同一个探测，同一个症状
//   3. 同上，PAGES 列表里的路径也没带前缀
//   4. 冒烟里 page.goto 到 rss.xml，浏览器去探源站根的 /favicon.ico，子路径下 404
//
// 所以所有要拼地址的脚本都从这里取，别各写各的。
export const BASE_PATH = (process.env.SITE_BASE ?? '/').replace(/\/+$/, '');

/** 拼一个带 base 的完整地址：at('http://localhost:4321', '/blog/') */
export const at = (origin, p = '/') => origin + BASE_PATH + p;
