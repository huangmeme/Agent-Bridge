#!/bin/bash

echo "=== Agent Bridge 验收测试 ==="
echo ""

SESSION_DIR="$HOME/.agent-bridge/sessions"
REGISTRY_FILE="$HOME/.agent-bridge/active-sessions.json"

echo "1. 检查会话文件目录..."
if [ -d "$SESSION_DIR" ]; then
  echo "   ✓ 会话目录存在: $SESSION_DIR"
  ls -la "$SESSION_DIR"
else
  echo "   ✗ 会话目录不存在，请先在 VS Code 中启用 Agent Bridge"
  exit 1
fi

echo ""
echo "2. 检查注册表文件..."
if [ -f "$REGISTRY_FILE" ]; then
  echo "   ✓ 注册表文件存在"
  cat "$REGISTRY_FILE"
else
  echo "   ✗ 注册表文件不存在"
fi

echo ""
echo "3. 读取第一个会话文件..."
SESSION_FILE=$(ls "$SESSION_DIR"/*.json 2>/dev/null | head -1)
if [ -n "$SESSION_FILE" ]; then
  echo "   ✓ 找到会话文件: $SESSION_FILE"
  
  ENDPOINT=$(cat "$SESSION_FILE" | grep -o '"endpoint"[^,]*' | cut -d'"' -f4)
  TOKEN=$(cat "$SESSION_FILE" | grep -o '"token"[^,]*' | cut -d'"' -f4)
  
  echo "   Endpoint: $ENDPOINT"
  echo "   Token: ${TOKEN:0:8}..."
  
  echo ""
  echo "4. 测试 /v1/health 端点..."
  curl -s "$ENDPOINT/v1/health" | jq .
  
  echo ""
  echo "5. 测试 /v1/capabilities 端点..."
  curl -s "$ENDPOINT/v1/capabilities" | jq .
  
  echo ""
  echo "6. 测试 /v1/context/active-editor 端点..."
  curl -s -H "Authorization: Bearer $TOKEN" "$ENDPOINT/v1/context/active-editor" | jq .
  
  echo ""
  echo "7. 测试无 token 访问 (应返回 401)..."
  curl -s -w "\nHTTP Status: %{http_code}\n" "$ENDPOINT/v1/context/active-editor"
  
  echo ""
  echo "8. 测试错误 token (应返回 403)..."
  curl -s -w "\nHTTP Status: %{http_code}\n" -H "Authorization: Bearer invalid-token" "$ENDPOINT/v1/context/active-editor"
else
  echo "   ✗ 没有找到会话文件"
fi

echo ""
echo "=== 测试完成 ==="
