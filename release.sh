#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: bash release.sh <版本号> [--prerelease]"
  echo "示例: bash release.sh 1.0.0-beta.2 --prerelease"
  exit 1
fi

RAW_VERSION="$1"
if [[ "$RAW_VERSION" == v* ]]; then
  TAG="$RAW_VERSION"
else
  TAG="v$RAW_VERSION"
fi
VERSION_NO_V="${TAG#v}"

PRERELEASE="false"
if [[ "${2:-}" == "--prerelease" ]]; then
  PRERELEASE="true"
fi
if [[ "$TAG" == *"-beta"* || "$TAG" == *"-rc"* ]]; then
  PRERELEASE="true"
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "错误：GitHub CLI 未登录，请先执行 gh auth login"
  exit 1
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "错误：Release $TAG 已存在，请更换版本号"
  exit 1
fi

echo "[1/4] 构建 sidepanel..."
npm run build

ASSET_PATH="release/wegent-${VERSION_NO_V}-extension.zip"
mkdir -p release
rm -f "$ASSET_PATH"

echo "[2/4] 打包发布附件..."
if command -v zip >/dev/null 2>&1; then
  zip -r "$ASSET_PATH" manifest.json background.js content.js icons sidepanel LICENSE README.md >/dev/null
elif command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Compress-Archive -Path manifest.json,background.js,content.js,icons,sidepanel,LICENSE,README.md -DestinationPath '$ASSET_PATH' -Force" >/dev/null
else
  echo "错误：未找到 zip 或 powershell，无法打包"
  exit 1
fi

NOTES_FILE="$(mktemp)"
trap 'rm -f "$NOTES_FILE"' EXIT

if [[ "$PRERELEASE" == "true" ]]; then
  RELEASE_KIND="Beta 版本说明"
else
  RELEASE_KIND="版本说明"
fi

cat > "$NOTES_FILE" <<EOF
## ${RELEASE_KIND}
这是 Wegent ${TAG} 的发布版本。

## 安装使用
1. 下载附件 \`wegent-${VERSION_NO_V}-extension.zip\` 并解压。
2. 打开 Chrome：\`chrome://extensions\`。
3. 开启右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择解压后的目录（目录内应包含 \`manifest.json\`）。
5. 安装后点击扩展图标，或按 \`Ctrl+B\`（Mac 为 \`Command+B\`）打开侧边栏。

## 首次配置
1. 打开侧边栏进入「设置中心」。
2. 配置 \`API Base URL\`、\`API Key\`、\`Model\`。
3. 保存配置后即可开始自然语言网页操作。

## 已知事项
- 若为 Beta / RC 版本，建议先在测试环境验证。
- 导入或刷新 Skill Package 时请确认来源可信。
EOF

echo "[3/4] 创建 GitHub Release..."
GH_ARGS=(release create "$TAG" "$ASSET_PATH" --target main --title "Wegent ${TAG}" --notes-file "$NOTES_FILE")
if [[ "$PRERELEASE" == "true" ]]; then
  GH_ARGS+=(--prerelease)
fi

RELEASE_URL="$(gh "${GH_ARGS[@]}")"

echo "[4/4] 发布完成"
echo "$RELEASE_URL"
