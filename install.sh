#!/usr/bin/env bash
# ============================================================================
# dsh-prompt-enhance 一键安装(幂等,可重复执行)
# ----------------------------------------------------------------------------
# 用法:
#   ./install.sh [--dry-run | --check] [DSH_HOME] [PROFILE]
# 默认: DSH_HOME=$HOME/.dsh,PROFILE=web
#
# 动作:
#   1) 把 <PROFILE>/node_modules/dsh-prompt-enhance 做成**指向本仓库的符号链接**
#      (v0.7.0 起;旧版是 cp -R 实体副本,于是「改了源码忘了重跑 install.sh」
#       就会一直跑旧字节 —— 那类事故已经真实发生过)
#   2) 把 insert 行注册进 <PROFILE>/cordis.patch.yml
#   3) 提示重启 DSH
#
# --check:只读校验(链接存在 + 指向本仓库 + 组合已注册),不满足即 exit 1。
#          已接入 dsh-upgrade 作为「失败即中止、绝不重启」的一步。
# --dry-run:只打印将要做什么。
#
# 为什么符号链接可行(实测):
#   Node 的 loader 在 import 时会 canonical 化到**真实路径**再向上找 node_modules,
#   所以框架包回退(@deepseek-ai/*)照常命中。
#   注意 createRequire(anchor).resolve.paths() 返回的是符号链接的父目录,看起来像
#   会失败 —— 那只是 resolve.paths() 不做 canonical 化的假象,真实 import 不受影响。
#
# 卸载:删除 node_modules/dsh-prompt-enhance 符号链接,并从 cordis.patch.yml
#       移除 id: prompt-enhance 的 insert 块,重启即可。
# ============================================================================
set -euo pipefail

MODE="install"
case "${1:-}" in
  --dry-run) MODE="dry-run"; shift ;;
  --check)   MODE="check";   shift ;;
esac

DSH_HOME="${1:-${DSH_HOME:-$HOME/.dsh}}"
PROFILE="${2:-web}"
PKG="dsh-prompt-enhance"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
NODE_MODULES="$PROFILE_DIR/node_modules"
TARGET_LINK="$NODE_MODULES/$PKG"
PATCH_MARK="id: prompt-enhance"

fail() { printf '  \033[31m✗ %s\033[0m\n' "$1"; exit 1; }
ok()   { printf '  \033[32m✅ %s\033[0m\n' "$1"; }

[ -d "$PROFILE_DIR" ] || fail "未找到 profile 目录 $PROFILE_DIR(可用 \$1 指定 DSH_HOME)"
[ -f "$REPO_DIR/lib/index.js" ] && [ -f "$REPO_DIR/lib/client.js" ] \
  || fail "请在 dsh-prompt-enhance 仓库目录中运行本脚本"

# ---------------------------------------------------------------------------
# 只读体检(--check,以及 dsh-upgrade 的 4c 步)
# ---------------------------------------------------------------------------
if [ "$MODE" = "check" ]; then
  problems=0

  if [ -L "$TARGET_LINK" ]; then
    resolved="$(readlink "$TARGET_LINK")"
    if [ "$resolved" = "$REPO_DIR" ]; then
      ok "插件链接存在且指向本仓库"
    else
      printf '  \033[31m❌ 链接指向他处: %s(期望 %s)\033[0m\n' "$resolved" "$REPO_DIR"
      problems=$((problems+1))
    fi
  elif [ -d "$TARGET_LINK" ]; then
    printf '  \033[31m❌ 是实体目录副本(旧式安装),源码改动不会生效 —— 重跑 install.sh 迁移为符号链接\033[0m\n'
    problems=$((problems+1))
  else
    printf '  \033[31m❌ 未安装:%s 不存在\033[0m\n' "$TARGET_LINK"
    problems=$((problems+1))
  fi

  if [ -f "$PATCH_FILE" ] && grep -q "$PATCH_MARK" "$PATCH_FILE"; then
    ok "组合配置已注册($PATCH_FILE)"
  else
    printf '  \033[31m❌ 组合配置未注册:%s 缺 "%s"\033[0m\n' "$PATCH_FILE" "$PATCH_MARK"
    problems=$((problems+1))
  fi

  # 框架契约哨兵:失败只告警,不阻断安装态判定(它是插件自检,不是安装态的一部分)
  if command -v node >/dev/null 2>&1; then
    if (cd "$REPO_DIR" && node tests/contract-sentinel.mjs >/dev/null 2>&1); then
      ok "框架契约哨兵通过"
    else
      printf '  \033[33m⚠️  框架契约哨兵未通过(安装态无碍,但建议看:cd %s && npm run sentinel)\033[0m\n' "$REPO_DIR"
    fi
  fi

  [ "$problems" = 0 ] || exit 1
  exit 0
fi

# ---------------------------------------------------------------------------
# dry-run
# ---------------------------------------------------------------------------
if [ "$MODE" = "dry-run" ]; then
  echo "dry-run:"
  echo "  1. 符号链接 $REPO_DIR → $TARGET_LINK"
  echo "     (若该位置是旧式实体副本,先备份到 $TARGET_LINK.bak)"
  echo "  2. 在 $PATCH_FILE 注册 - insert: - $PATCH_MARK"
  echo "  3. 重启 DSH 生效:launchctl kickstart -k gui/501/com.deepseek.dsh.web"
  exit 0
fi

# ---------------------------------------------------------------------------
# 安装
# ---------------------------------------------------------------------------
[ -w "$NODE_MODULES" ] || [ -w "$PROFILE_DIR" ] || fail "$NODE_MODULES 与 $PROFILE_DIR 都不可写"
[ -w "$PROFILE_DIR" ] || fail "$PROFILE_DIR 不可写"

echo "[1/3] 链接插件到插件目录: $TARGET_LINK"
mkdir -p "$NODE_MODULES"
# 旧式实体副本 → 一次性迁移:备份后替换为符号链接,保留可回滚路径
if [ -d "$TARGET_LINK" ] && [ ! -L "$TARGET_LINK" ]; then
  rm -rf "$TARGET_LINK.bak"
  mv "$TARGET_LINK" "$TARGET_LINK.bak"
  echo "  检测到旧式实体副本,已备份 → $TARGET_LINK.bak"
fi
if [ -L "$TARGET_LINK" ] && [ "$(readlink "$TARGET_LINK")" = "$REPO_DIR" ]; then
  echo "  已是正确链接,跳过"
else
  ln -sfn "$REPO_DIR" "$TARGET_LINK"
  echo "  已建立符号链接(改源码后只需重启,无需重跑本脚本)"
fi

echo "[2/3] 注册组合配置: $PATCH_FILE"
if [ -f "$PATCH_FILE" ] && grep -q "$PATCH_MARK" "$PATCH_FILE"; then
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

echo "[3/3] 安装完成。**必须重启 DSH 才生效**:"
echo "  launchctl kickstart -k gui/501/com.deepseek.dsh.web"
echo ""
echo "  为什么必须重启:客户端 bundle 在服务端按内容哈希(rev)缓存在内存里,"
echo "  不重启的话浏览器刷新拿到的仍是旧字节。"
echo ""
echo "  自检:./install.sh --check"
echo "  回滚:rm -f $TARGET_LINK && mv $TARGET_LINK.bak $TARGET_LINK(若 .bak 存在)"
echo "  卸载:rm -f $TARGET_LINK,并从 $PATCH_FILE 移除 \"$PATCH_MARK\" 的 insert 块"
