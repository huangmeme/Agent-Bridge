@echo off
setlocal enabledelayedexpansion

echo === Agent Bridge 验收测试 ===
echo.

set SESSION_DIR=%USERPROFILE%\.agent-bridge\sessions
set REGISTRY_FILE=%USERPROFILE%\.agent-bridge\active-sessions.json

echo 1. 检查会话文件目录...
if exist "%SESSION_DIR%" (
  echo    √ 会话目录存在: %SESSION_DIR%
  dir /b "%SESSION_DIR%"
) else (
  echo    × 会话目录不存在，请先在 VS Code 中启用 Agent Bridge
  exit /b 1
)

echo.
echo 2. 检查注册表文件...
if exist "%REGISTRY_FILE%" (
  echo    √ 注册表文件存在
  type "%REGISTRY_FILE%"
) else (
  echo    × 注册表文件不存在
)

echo.
echo 3. 测试步骤：
echo    a. 在 VS Code 中打开一个源代码文件
echo    b. 运行命令: Agent Bridge: Enable for Current Workspace
echo    c. 复制会话文件路径: Agent Bridge: Copy Session File Path
echo    d. 使用以下命令测试 API:
echo.
echo       # 获取 health
echo       curl http://127.0.0.1:PORT/v1/health
echo.
echo       # 获取 capabilities
echo       curl http://127.0.0.1:PORT/v1/capabilities
echo.
echo       # 获取活动编辑器上下文 (需要 token)
echo       curl -H "Authorization: Bearer TOKEN" http://127.0.0.1:PORT/v1/context/active-editor
echo.
echo    (将 PORT 和 TOKEN 替换为会话文件中的实际值)
echo.
echo === 说明完成 ===
