/**
 * 开了 ClientRouter 之后，页面脚本的初始化时机有个坑：
 * Astro 的 <script> 是 ES module（天然 defer），换页时被重新插入文档、异步执行，
 * 很可能赶不上这一次导航的 astro:page-load —— 监听注册晚了，这一次就不会被调用，
 * 表现为「刚进页面那一小会儿，交互是死的」。
 *
 * 所以两条路一起走：脚本一执行就先跑一次，之后每次 page-load 再跑一次。
 * 代价是 init 可能被调用两次，因此它必须幂等 —— 用 markReady 在根节点上打个标记即可。
 * 换页时根节点是全新的 DOM，标记自然失效，不用手动清理。
 */
export function onPageReady(init: () => void): void {
  init();
  document.addEventListener('astro:page-load', init);
}

/** 首次拿到这个节点返回 true，重复调用返回 false。节点不存在也返回 false。 */
export function markReady(el: HTMLElement | null): boolean {
  if (!el || el.dataset.ready === '1') return false;
  el.dataset.ready = '1';
  return true;
}
