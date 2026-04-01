#!/bin/bash
# ============================================================
# AI Research Agent — macOS .app 打包脚本
# ============================================================
set -e

APP_NAME="AI Research Agent"
APP_DIR="dist/${APP_NAME}.app"
CONTENTS="${APP_DIR}/Contents"
MACOS="${CONTENTS}/MacOS"
RESOURCES="${CONTENTS}/Resources"
BACKEND_SRC="backend"

echo "🔨 开始构建 ${APP_NAME}..."

# 清理
rm -rf "dist/${APP_NAME}.app"
mkdir -p "${MACOS}" "${RESOURCES}"

# ── 1. 编译前端 ──
echo "📦 编译前端..."
cd frontend
npm run build 2>&1 | tail -1
cd ..

# ── 2. 复制后端代码 ──
echo "📂 复制后端代码..."
cp -r "${BACKEND_SRC}/main.py" "${RESOURCES}/"
cp -r "${BACKEND_SRC}/config.py" "${RESOURCES}/"
cp -r "${BACKEND_SRC}/modules" "${RESOURCES}/"
cp -r "${BACKEND_SRC}/pipeline" "${RESOURCES}/"
cp -r "${BACKEND_SRC}/api" "${RESOURCES}/"
cp -r "${BACKEND_SRC}/db" "${RESOURCES}/"
cp -r "${BACKEND_SRC}/repos" "${RESOURCES}/" 2>/dev/null || true
cp -r "${BACKEND_SRC}/.env" "${RESOURCES}/" 2>/dev/null || true

# 复制前端静态文件
cp -r frontend/dist "${RESOURCES}/static"

# 复制 Python 虚拟环境
echo "📂 复制 Python 环境 (这可能需要一分钟)..."
cp -r "${BACKEND_SRC}/venv" "${RESOURCES}/venv"

# ── 3. 创建启动脚本 ──
echo "⚙️  创建启动脚本..."
cat > "${MACOS}/launch" << 'LAUNCHER'
#!/bin/bash
# AI Research Agent Launcher
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
cd "$DIR"

# 激活虚拟环境
export PATH="$DIR/venv/bin:$PATH"

# 加载 .env
if [ -f "$DIR/.env" ]; then
    set -a
    source "$DIR/.env"
    set +a
fi

# 确保 workspace 目录存在
mkdir -p "$DIR/workspace"
export DATABASE_URL="sqlite+aiosqlite:///$DIR/research_agent.db"

# 启动后端
echo "[AI Research Agent] 启动中..."
python -m uvicorn main:app --host 127.0.0.1 --port 8000 &
SERVER_PID=$!

# 等待服务启动
sleep 2
for i in {1..10}; do
    if curl -s http://127.0.0.1:8000/api/tasks > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# 打开浏览器
open "http://127.0.0.1:8000"

echo "[AI Research Agent] 已启动: http://127.0.0.1:8000"
echo "[AI Research Agent] 关闭此窗口将停止服务"

# 等待服务进程
wait $SERVER_PID
LAUNCHER
chmod +x "${MACOS}/launch"

# ── 4. 创建 Info.plist ──
cat > "${CONTENTS}/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>CFBundleIdentifier</key>
    <string>com.ai-research-agent.app</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSBackgroundOnly</key>
    <false/>
</dict>
</plist>
PLIST

# ── 5. 创建图标 (简单文本图标) ──
# 使用系统自带的图标工具
if command -v sips &> /dev/null; then
    # 创建一个简单的图标
    python3 -c "
import struct, zlib
def create_png(w, h, color=(16, 163, 127)):
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''
    for y in range(h):
        raw += b'\\x00'
        for x in range(w):
            # Simple circle
            dx, dy = x - w//2, y - h//2
            if dx*dx + dy*dy < (w//2 - 4)**2:
                raw += bytes(color) + b'\\xff'
            else:
                raw += b'\\x00\\x00\\x00\\x00'
    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
with open('${RESOURCES}/icon.png', 'wb') as f:
    f.write(create_png(256, 256))
" 2>/dev/null || true
fi

# ── 6. 计算大小 ──
APP_SIZE=$(du -sh "${APP_DIR}" | cut -f1)
echo ""
echo "✅ 构建完成!"
echo "   应用: ${APP_DIR}"
echo "   大小: ${APP_SIZE}"
echo ""
echo "💡 使用方法:"
echo "   双击 ${APP_NAME}.app 即可启动"
echo "   或: open \"${APP_DIR}\""
