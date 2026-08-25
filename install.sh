#!/usr/bin/env bash
# ============================================================================
# dsh-prompt-enhance 一键安装(幂等,可重复执行)
# 用法:
#   ./install.sh [--dry-run] [DSH_HOME] [PROFILE]
# 默认: DSH_HOME=$HOME/.dsh,PROFILE=web
# 动作:
#   1) 把本仓库复制到 <DSH_HOME>/profiles/<PROFILE>/node_modules/dsh-prompt-enhance
#      (替换前自动备份旧副本到 dsh-prompt-enhance.bak,可回滚)
#   2) 把 insert 行注册进 <DSH_HOME>/profiles/<PROFILE>/cordis.patch.yml
#   3) 提示重启 DSH
# 卸载: 删除 node_modules/dsh-prompt-enhance 并从 cordis.patch.yml 移除
#       id: prompt-enhance 的 insert 块,重启即可。
# ============================================================================
set -euo pipefail

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  shift
fi

DSH_HOME="${1:-${DSH_HOME:-$HOME/.dsh}}"
PROFILE="${2:-web}"
PKG="dsh-prompt-enhance"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
NODE_MODULES="$PROFILE_DIR/node_modules"
TARGET_DIR="$NODE_MODULES/$PKG"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "错误:未找到 profile 目录 $PROFILE_DIR(可用 \$1 指定 DSH_HOME)"
  exit 1
fi
if [ ! -f "$REPO_DIR/lib/index.js" ] || [ ! -f "$REPO_DIR/lib/client.js" ]; then
  echo "错误:请在 dsh-prompt-enhance 仓库目录中运行本脚本"
  exit 1
fi

if $DRY_RUN; then
  echo "dry-run:"
  echo "  1. 复制本仓库 → $TARGET_DIR(替换前备份到 $TARGET_DIR.bak)"
  echo "  2. 在 $PATCH_FILE 注册 - insert: - id: prompt-enhance"
  echo "  3. 重启 DSH 生效"
  exit 0
fi

# 写权限预检
[ -w "$NODE_MODULES" ] || { echo "错误: $NODE_MODULES 不可写"; exit 1; }
[ -w "$PROFILE_DIR" ] || { echo "错误: $PROFILE_DIR 不可写"; exit 1; }

echo "[1/3] 复制插件到插件目录: $TARGET_DIR"
mkdir -p "$NODE_MODULES"
if [ -e "$TARGET_DIR" ] || [ -L "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR.bak"
  mv "$TARGET_DIR" "$TARGET_DIR.bak"
  echo "  已备份旧副本 → $TARGET_DIR.bak"
fi
mkdir -p "$TARGET_DIR"
cp -R "$REPO_DIR/lib" "$REPO_DIR/assets" "$REPO_DIR/config" "$REPO_DIR/cordis.patch.yml" \
      "$REPO_DIR/package.json" "$REPO_DIR/README.md" "$REPO_DIR/README.en.md" "$REPO_DIR/LICENSE" \
      "$TARGET_DIR/"
echo "  已复制($(du -sh "$TARGET_DIR" | cut -f1))"

echo "[2/3] 注册组合配置: $PATCH_FILE"
if [ -f "$PATCH_FILE" ] && grep -q 'id: prompt-enhance' "$PATCH_FILE"; then
  echo "  已注册,跳过"
else
  if [ ! -f "$PATCH_FILE" ]; then
    printf '# dsh profile patch layer(由 dsh-prompt-enhance/install.sh 创建)\n' > "$PATCH_FILE"
  fi
  cat >> "$PATCH_FILE" <<'EOF'

- insert:
    - id: prompt-enhance
      name: 'dsh-prompt-enhance'
EOF
  echo "  已追加注册行"
fi

echo "[3/3] 安装完成。重启 DSH 后生效:"
echo "  · Host 半: POST /prompt-enhance/api/enhance、GET /prompt-enhance/icons/*、自检工具"
echo "  · Client 半: 输入框工具行魔法棒(经 clientModules 自动加载)"
echo "  · 更新:修改仓库代码后重新执行本脚本并重启"
echo "  · 回滚:mv $TARGET_DIR.bak $TARGET_DIR,重启"
echo "  · 卸载:rm -rf $TARGET_DIR,并从 $PATCH_FILE 移除 id: prompt-enhance 的 insert 块"
