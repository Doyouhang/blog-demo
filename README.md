# 迩迩的小站（Astro + Gitee Pages）

一个用 [Astro](https://astro.build) 搭建的个人博客 + 兴趣分享页，**静态托管在 Gitee Pages，完全免费**。

## 本地开发

```bash
npm install
npm run dev      # 本地预览，默认 http://localhost:4321
npm run build    # 生成静态站点到 dist/
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

## 部署到 Gitee Pages

### 方式一：手动部署（最简单，推荐先试）

1. 在 Gitee 新建仓库（例如 `blog-demo`）。
2. 本地构建：`npm run build`，得到 `dist/`。
3. 把 `dist/` 里的文件推到仓库的一个分支（建议 `gitee-pages`）：
   ```bash
   cd dist
   git init -q && git add -A && git commit -q -m "deploy"
   git push -f git@gitee.com:Doyouhang/blog-demo.git HEAD:gitee-pages
   ```
4. 仓库 → **服务** → **Gitee Pages** → 选择 `gitee-pages` 分支 → 部署。
5. 访问 `https://Doyouhang.gitee.io/blog-demo/`（项目页）或 `https://Doyouhang.gitee.io/`（用户页）。

> 注意 base 路径：
> - **用户页**（仓库名 `<用户名>.gitee.io`）：保持默认，`base: '/'`。
> - **项目页**（普通仓库名）：构建前设置 `GITEE_BASE=/仓库名/`，例如 `GITEE_BASE=/blog-demo/ npm run build`。

### 方式二：一键脚本 `deploy.sh`

已内置 `deploy.sh`，推到 Gitee 的 `gitee-pages` 分支：
```bash
GITEE_REMOTE=git@gitee.com:Doyouhang/blog-demo.git ./deploy.sh
```

### 方式三：GitHub Actions 自动部署（可选）

如果你把仓库镜像到 GitHub，可使用 `.github/workflows/deploy.yml`：
push 到 `main` 后自动构建并推到 Gitee 的 `gitee-pages` 分支。
需要在 GitHub 仓库 **Settings → Secrets** 里配置 `GITEE_TOKEN`（Gitee 私人令牌，有推送权限）。

## 绑定自己的域名（可选）

- Gitee Pages 绑定自定义域名需开通 **Gitee 会员**（约 ¥99/年）。
- 国内规则下自定义域名需完成 **ICP 备案**（使用 `xxx.gitee.io` 免费子域名则无需备案）。
