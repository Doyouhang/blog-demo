// 估算阅读时长：中文按每分钟 400 字，英文按每分钟 200 词，混排就两边相加。
export function readingMinutes(markdown: string): number {
  const body = markdown
    .replace(/```[\s\S]*?```/g, ' ') // 代码块不计入
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' '); // 图片和链接只留下文字量级
  const cjk = body.match(/[一-鿿㐀-䶿]/g)?.length ?? 0;
  const words = body.replace(/[一-鿿㐀-䶿]/g, ' ').match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
}
