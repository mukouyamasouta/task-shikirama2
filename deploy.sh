#!/usr/bin/env bash
# VEXUM 本番デプロイスクリプト（vexum-deploy.vercel.app）
#
# このフォルダには個人書類が同居しているため、アプリ本体だけを
# 一時フォルダに集めて vexum-deploy プロジェクトへ本番デプロイする。
# 使い方:  bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

ST="/tmp/vexum-stage"
rm -rf "$ST"; mkdir -p "$ST/web"
cp ./*.html vercel.json "$ST"/ 2>/dev/null || true
cp web/*.js "$ST/web"/ 2>/dev/null || true
cp -r supabase "$ST"/ 2>/dev/null || true
mkdir -p "$ST/.vercel"
printf '{"projectId":"prj_anwbB1AlwZmB9cXgN9WxQHTirou7","orgId":"team_YZJOpPrNq1fUHNdCF6bj0PVE","projectName":"vexum-deploy"}' > "$ST/.vercel/project.json"

echo "▶ アプリ本体を $ST に集約（$(du -sh "$ST" | cut -f1)）"
cd "$ST"
echo "▶ vexum-deploy へ本番デプロイ中…"
npx -y vercel@latest deploy --prod --yes
echo "✅ 完了: https://vexum-deploy.vercel.app/"
