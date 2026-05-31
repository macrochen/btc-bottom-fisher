#!/bin/bash

PORT=8787

echo "🔍 检查端口 $PORT 是否被占用..."
PID=$(lsof -ti:$PORT)

if [ ! -z "$PID" ]; then
  echo "⚠️ 发现端口 $PORT 正被进程 (PID: $PID) 占用，准备终止该进程..."
  kill -9 $PID
  echo "✅ 进程已终止，端口已释放。"
else
  echo "✅ 端口 $PORT 当前空闲。"
fi

echo "🚀 启动 Cloudflare Worker 本地开发服务器..."
# 在后台启动应用
npm run dev &
DEV_PID=$!

echo "⏳ 等待服务器就绪..."
# 循环检测端口是否已开始监听
while ! nc -z localhost $PORT; do   
  sleep 0.5
done

echo "🌐 服务器已就绪！正在浏览器中打开首页..."
open http://localhost:$PORT

# 保持脚本前台运行，以便您可以查看到 wrangler 的实时日志
wait $DEV_PID
