# 迩迩的小站（Astro + GitHub Pages）

一个用 [Astro](https://astro.build) 搭建的个人博客 + 兴趣分享页，**静态托管在 GitHub Pages，完全免费**。

> 注：Gitee Pages 已于 2025-06-06 官方下线，本项目改用 GitHub Pages。

## 本地开发

```bash
npm install
npm run dev      # 本地预览，默认 http://localhost:4321
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
  styles/global.css # 全局样式
public/             # 静态资源（favicon 等）
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
