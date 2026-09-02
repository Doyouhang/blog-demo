// 构建期生成 robots.txt：Sitemap 行要拼站点地址 + base，
// 写死在 public/ 里适配不了项目页（/blog-demo/）与用户页（/）两种 base。
export function GET({ site }: { site: URL }) {
  const sitemap = new URL(`${import.meta.env.BASE_URL}sitemap-index.xml`, site);
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
