# 浏览器冒烟测试

跨页转场、demo 初始化时机、主题持久化、窄屏溢出、内容型页面结构 —— 这些靠
`astro check` 查不出来，靠截图也看不出来（比如「按住琴键时冒出滚动条」只在按住的那一刻发生）。

## 跑法

```bash
npm run build && npm run preview &   # 冒烟跑构建产物，不跑 dev
node tests/smoke.mjs
```

依赖 `playwright-core` 和系统的 `/usr/bin/google-chrome`，不下载浏览器。
装依赖：`npm i -D playwright-core`（或在任意目录装好后用 NODE_PATH 指过去）。

## 为什么不跑 dev server

反复启停 `astro dev` 会耗尽 inotify 句柄，dev server 会崩在 FSWatcher 上。
`astro preview` 跑构建产物，不监听文件，也更接近线上。

## 改页面结构后

选择器断言会跟着失效，这是设计如此 —— 它就是用来拦住「改着改着把结构改坏了」的。
失败时先看断言描述，判断是页面真坏了还是测试该更新。
