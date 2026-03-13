# Task Plan: VS Code Agent Bridge MVP

## Goal
创建一个 TypeScript VS Code 扩展，在扩展宿主内启动本地 HTTP 服务，让外部 agent 通过 VS Code 读取当前活动文本编辑器真实可见的上下文。

## Phases
- [x] Phase 1: 项目脚手架搭建
  - [x] 初始化 pnpm + TypeScript 项目
  - [x] 配置 VS Code 扩展清单 (package.json)
  - [x] 设置 TypeScript 编译配置
  - [x] 创建基本目录结构
- [x] Phase 2: 核心类型定义
  - [x] 定义 HTTP API 响应类型
  - [x] 定义会话文件格式类型
  - [x] 定义上下文快照类型
- [x] Phase 3: 会话管理模块
  - [x] 实现会话 ID 和令牌生成
  - [x] 实现会话文件读写
  - [x] 实现注册表管理 (active-sessions.json)
- [x] Phase 4: HTTP 服务层
  - [x] 创建 HTTP 服务器 (仅监听 127.0.0.1)
  - [x] 实现 /v1/health 端点
  - [x] 实现 /v1/capabilities 端点
  - [x] 实现 /v1/context/active-editor 端点
  - [x] 实现 Bearer token 认证中间件
- [x] Phase 5: 上下文采集模块
  - [x] 实现 visibleRanges 文本提取
  - [x] 实现选区信息采集
  - [x] 实现诊断信息采集
  - [x] 处理无活动编辑器场景
  - [x] 处理不支持的编辑器类型
- [x] Phase 6: VS Code 集成
  - [x] 实现 enableWorkspace 命令
  - [x] 实现 disableWorkspace 命令
  - [x] 实现 copySessionFilePath 命令
  - [x] 实现状态栏显示
  - [x] 实现扩展激活/停用生命周期
- [x] Phase 7: 测试
  - [x] 编写单元测试
  - [x] 编写集成测试
  - [ ] 手动验收测试

## Key Questions
1. HTTP 服务器使用哪个库？(原生 http 模块 vs express vs fastify) -> 决定使用原生 http 模块
2. 如何处理多工作区窗口场景？-> 通过注册表管理多个会话文件
3. 如何确保扩展停用时正确清理资源？-> 在 dispose 中清理会话文件和关闭服务器

## Decisions Made
- 使用 pnpm 作为包管理器
- 使用原生 http 模块 + 手动路由，保持轻量
- 位置坐标统一使用 0-based
- 不做缓存，每次请求现算快照
- 测试框架使用 mocha + @vscode/test-electron

## Errors Encountered
1. NotebookEditor 类型检查错误 -> 移除不必要的 instanceof 检查
2. 模块导入路径错误 -> 修正 middleware 和 routes 中的相对路径
3. 多工作区绑定错误 -> enableWorkspace 现在优先取活动编辑器所属工作区，多工作区时弹选择框
4. 禁用时停掉 HTTP 服务 -> 禁用只清理会话，HTTP 服务保持运行，health 端点可返回 disabled 状态
5. 非标准编辑器判断不足 -> 增加对 diff、git、output 等 scheme 的 unsupported 判断，只接受 file/untitled
6. 测试链路损坏 -> Windows 路径空格导致 VS Code 扩展宿主截断路径，通过创建 junction 解决

## Status
**Phase 7 完成** - 代码编译通过，测试通过，所有问题已修复
