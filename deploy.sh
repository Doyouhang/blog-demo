#!/usr/bin/env bash
set -e

# 用法：
#   GITEE_REMOTE=git@gitee.com:你的用户名/blog-demo.git ./deploy.sh
# 项目页（仓库名不是 <用户名>.gitee.io）还需设置 base：
#   GITEE_BASE=/仓库名/ GITEE_REMOTE=... ./deploy.sh

REMOTE="${GITEE_REMOTE:-git@gitee.com:Doyouhang/blog-demo.git}"
BRANCH="${GITEE_BRANCH:-gitee-pages}"

npm run build

cd dist
git init -q
git add -A
git commit -q -m "deploy: $(date +%F_%T)"
git push -f "$REMOTE" HEAD:"$BRANCH"
cd ..
rm -rf dist/.git

echo "✅ 已推送到 $REMOTE ($BRANCH)，去 Gitee 开启 Pages 即可。"
