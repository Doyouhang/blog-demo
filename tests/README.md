# 浏览器冒烟测试

跨页转场、demo 初始化时机、主题持久化、窄屏溢出、内容型页面结构、站内搜索质量 ——
这些靠 `astro check` 查不出来，靠截图也看不出来（比如「按住琴键时冒出滚动条」只在按住的那一刻发生）。

## 跑法

```bash
npm run build && npm run test:smoke
```

`test:smoke` 自己起 preview、跑完自己关掉，不用手动管服务。

端口被占时它会直接报错而不是继续跑：

```bash
SMOKE_PORT=4351 npm run test:smoke   # 4331 是 studio 的，别用
```

依赖 `playwright-core` 和系统的 `/usr/bin/google-chrome`，不下载浏览器。

## 为什么要包一层 run.mjs

手动「后台起 preview + 跑测试 + pkill」踩过三次同一个坑：

- 4321 被占时，**astro 会静默顺延到 4322/4323**，而测试还在连 4321，
  于是连到了完全不相干的服务，报出来的错和真实问题毫无关系
- `kill` 只杀得掉 `npx`，底下真正监听端口的 astro 进程活得好好的，
  每跑一次漏一个，下次再跑就被自己占了

`run.mjs` 显式指定端口、被占就报错不猜，并且用 `detached` + 杀进程组来真正收干净，
跑完还会回头确认端口放开了没有。

## 为什么不跑 dev server

反复启停 `astro dev` 会耗尽 inotify 句柄，dev server 会崩在 FSWatcher 上。
`astro preview` 跑构建产物，不监听文件，也更接近线上。

搜索测试还必须跑构建产物 —— 索引是 `npm run build` 生成的，dev 下根本不存在。

## 改页面结构后

选择器断言会跟着失效，这是设计如此 —— 它就是用来拦住「改着改着把结构改坏了」的。
失败时先看断言描述，判断是页面真坏了还是测试该更新。
