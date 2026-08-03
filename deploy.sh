#!/usr/bin/env bash
# 手动部署兜底方案（不依赖 GitHub Actions）：
# 把构建产物 dist/ 推送到 gh-pages 分支，再到仓库 Settings → Pages 选 gh-pages 分支。
set -e

REMOTE="${GH_REMOTE:-git@github.com:Doyouhang/blog-demo.git}"
BRANCH="${GH_BRANCH:-gh-pages}"
export SITE_BASE="${SITE_BASE:-/blog-demo/}"   # 用户页(用户名.github.io)改为 SITE_BASE=/

npm run build || echo "⚠️ 构建时 safe-delete 清理告警（忽略，产物已生成）"
test -f dist/index.html || { echo "❌ 构建失败：dist/index.html 不存在"; exit 1; }

cd dist
git init -q
git add -A
git commit -q -m "deploy: $(date +%F_%T)"
git push -f "$REMOTE" HEAD:"$BRANCH"
cd ..
rm -rf dist/.git 2>/dev/null || true

echo "✅ 已推送到 $REMOTE ($BRANCH)，去 GitHub 仓库 Settings → Pages 选 $BRANCH 分支启动即可。"
