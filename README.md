# 迩迩的小站（Astro + GitHub Pages）

一个用 [Astro](https://astro.build) 搭建的个人博客 + 兴趣分享页，**静态托管在 GitHub Pages，完全免费**。

> 注：Gitee Pages 已于 2025-06-06 官方下线，本项目改用 GitHub Pages。

## 环境准备

需要 **Node.js 22**（与 GitHub Actions 里的 `node-version: 22` 保持一致）和随附的 npm。

检查当前环境：

```bash
node -v   # 期望 v22.x
npm -v
```

### 安装 Node 22（Ubuntu，无需 sudo）

系统 apt 源里的 nodejs 只有 12.x，太老。下面这种装法把 Node 放在用户目录，不动系统、不需要 root：

```bash
# 1. 取最新的 v22 版本号并下载
VER=$(curl -sS https://nodejs.org/dist/index.json | grep -o '"version":"v22[^"]*"' | head -1 | cut -d'"' -f4)
mkdir -p ~/.local/opt && cd /tmp
curl -fSL -o node.tar.xz https://nodejs.org/dist/$VER/node-$VER-linux-x64.tar.xz

# 2. 解压并用软链固定路径（以后升级只需换这个软链）
tar -xJf node.tar.xz -C ~/.local/opt
ln -sfn ~/.local/opt/node-$VER-linux-x64 ~/.local/opt/node

# 3. 加进 PATH
echo 'export PATH="$HOME/.local/opt/node/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

node -v && npm -v
```

卸载就是 `rm -rf ~/.local/opt/node*` 再把 `~/.bashrc` 里那行删掉。

> 也可以用 [nvm](https://github.com/nvm-sh/nvm)（`nvm install 22`），适合需要在多个 Node 版本之间切换的场景。

### 装依赖

```bash
npm ci        # 按 package-lock.json 精确安装，推荐
# 或 npm install
```

国内网络慢的话可以临时换镜像：

```bash
npm ci --registry=https://registry.npmmirror.com
```

### 环境变量

| 变量 | 作用 | 取值 |
| --- | --- | --- |
| `SITE_BASE` | 站点路径前缀 | 本地开发不用设（默认 `/`）；构建项目页时设为 `/blog-demo/` |

页面里的链接一律用 `import.meta.env.BASE_URL` 拼接，不要写死 `/`，否则线上会 404。

### 完整自检

装完之后跑一遍，确认环境可用：

```bash
npm ci
npm run fetch:stocks              # 抓行情，正常会打印「已更新 8/8 条行情」
SITE_BASE=/blog-demo/ npm run build
```

`dist/` 下出现 `index.html`、`blog/`、`interests/`、`rss.xml` 就说明环境没问题。
注意 `fetch:stocks` 会改写 `src/data/stocks.json`，本地调试完记得 `git checkout -- src/data/stocks.json` 还原。

## 本地开发

```bash
npm ci           # 首次：安装依赖（详见上面「环境准备」）
npm run dev      # 本地预览，默认 http://localhost:4321
npm run check    # 类型检查（astro check），CI 里也会跑，提交前建议过一遍
npm run build    # 生成静态站点到 dist/（项目页会自动带 /blog-demo/ 前缀）
npm run preview  # 预览构建产物
```

## 目录结构

```
src/
  pages/            # 页面：首页 / 博客 / 兴趣 / 关于
  content/posts/    # 博客文章（写 Markdown 即可）
  layouts/          # 页面布局
  components/       # 头部、底部等组件
  data/
    interests.ts    # 兴趣列表的唯一数据源（首页和兴趣页都读它）
    stocks.*.json   # 股票自选清单 + 抓下来的行情快照
  scripts/init.ts   # 页面脚本初始化助手（跨页转场下的时机问题，见下）
  utils/            # 小工具函数（阅读时长估算等）
  styles/global.css # 全局样式与设计令牌（含暗色主题）
public/             # 静态资源（favicon 等）
scripts/
  fetch-stocks.mjs  # 构建期抓行情
```

## 主题与动效

- **暗色模式**：默认跟随系统（`prefers-color-scheme`），页头右上角的按钮可以手动切换，选择存在
  `localStorage.theme` 里。颜色全部走 `src/styles/global.css` 顶部的设计令牌，改配色只改那一处。
- **跨页转场**：`BaseLayout` 里引了 Astro 的 `<ClientRouter />`，换页是客户端导航 + View Transitions，
  文章标题和兴趣 emoji 用 `transition:name` 做了共享元素动画。
- **进场揭示**：加了 `class="reveal"` 的元素滚进视口才淡入上浮（`IntersectionObserver`）。
  JS 没跑起来时它们保持可见，不会白屏。
- **阅读进度条**：文章页顶部那条，纯 CSS 滚动驱动（`animation-timeline: scroll()`），
  浏览器不支持就不显示，不用兜底 JS。
- 以上动效全部受 `prefers-reduced-motion: reduce` 管辖，系统开了「减少动态效果」就自动关掉。

### 写页面脚本要注意的一个坑

Astro 的 `<script>` 是 ES module（天然 defer）。开了 `ClientRouter` 之后，换页时脚本会被重新插入
文档并**异步**执行，很可能赶不上这一次导航的 `astro:page-load` —— 直接写
`document.addEventListener('astro:page-load', init)` 会出现「刚进页面那一小会儿交互是死的」。

所以页面脚本统一用 `src/scripts/init.ts` 里的助手：

```ts
import { onPageReady, markReady } from '../../../scripts/init';

function initDemo() {
  const card = document.querySelector<HTMLElement>('.demo-card');
  if (!markReady(card)) return;   // 保证幂等，重复调用直接返回
  // ……绑定事件
}

onPageReady(initDemo);            // 立刻跑一次 + 之后每次 page-load 再跑
```

另外：View Transitions 在转场动画播放期间会用快照层盖住页面，这大约 250ms 内点击落不到真实元素上。
这是该 API 的固有行为，不是 bug。

## 股票行情与构建容错

`scripts/fetch-stocks.mjs` 在构建前抓一次东方财富的免费接口（无需 key），写进 `src/data/stocks.json`，
页面直接读这个 JSON，运行时零外部请求。

**这个脚本不会让构建失败。** 行情接口是第三方服务，从 GitHub 的海外 runner 上偶尔连不上；
一个兴趣页的数据源抖动不该把整个站点一起带下线。它的降级顺序是：

1. 抓取失败 → 最多重试 3 次；
2. 仍然失败 → 沿用仓库里已有的 `stocks.json`，打上 `stale: true`，页面顶部显示「不是最新价」提示；
3. 连历史数据都没有 → 写一份占位数据（`source: "sample"`），页面显示「示例数据」提示。

任何一种情况退出码都是 0，站点照常部署。

## 分享预览图（可选）

`src/consts.ts` 里的 `OG_IMAGE` 默认为空，此时只输出文字类分享信息。
想要微信 / X 上的大图卡片，放一张 1200×630 的图到 `public/`，然后：

```ts
export const OG_IMAGE = 'og.png';
```

## 写新文章

在 `src/content/posts/` 新建一个 `.md` 文件，头部写好 frontmatter：

```md
---
title: 文章标题
description: 一句话简介
pubDate: 2026-08-03
tags: ['标签1', '标签2']
draft: false
---

正文用 Markdown 写……
```

## 部署到 GitHub Pages

仓库 `blog-demo` 是**项目页**，线上地址为 `https://doyouhang.github.io/blog-demo/`。
配置里已默认 `SITE_BASE=/blog-demo/`，无需手动设置。

### 方式一：GitHub Actions 自动部署（推荐）

1. 在 GitHub 新建仓库 `blog-demo`（**不要**勾选初始化 README/LICENSE）。
2. 把本地仓库推到 GitHub（SSH 需先在 GitHub 添加你的公钥 `~/.ssh/id_ed25519.pub`）：
   ```bash
   git remote add github git@github.com:Doyouhang/blog-demo.git
   git push -u github main
   ```
3. 仓库 → **Settings → Pages** → Source 选 **GitHub Actions**。
4. 等 Actions 跑完（几分钟），访问 `https://doyouhang.github.io/blog-demo/`。

以后每次 `git push` 到 `main` 都会自动重新部署。

### 方式二：手动部署（兜底，不依赖 Actions）

把构建产物推到 `gh-pages` 分支，再到 Settings → Pages 选该分支：
```bash
GH_REMOTE=git@github.com:Doyouhang/blog-demo.git ./deploy.sh
```

## 换成用户页（可选）

若想要更干净的地址 `https://doyouhang.github.io/`（不带 `/blog-demo/`）：
1. 新建仓库，名称必须为 `doyouhang.github.io`。
2. 把 `astro.config.mjs` 里的 `SITE_BASE` 默认值改为 `/`（构建时不再带前缀）。
3. 部署方式同上。

## 绑定自己的域名（可选）

GitHub Pages 可免费绑定自定义域名（需在域名服务商做好 CNAME 解析）。
国内规则下自定义域名需完成 **ICP 备案**；使用 `*.github.io` 免费子域名无需备案。
