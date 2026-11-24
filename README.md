# 燕云大模型安全护栏 · 控制台在线演示

这是「燕云大模型安全护栏」控制台的静态演示版本（React 19 + TypeScript + Vite），内置示例数据，
**不连接任何真实服务**。完整功能需要私有化部署管理台、防护 API 与模型服务。

在线演示：<https://llaboon.github.io/yanyun-guardrail-console/>

## 演示模式

- 使用 hash 路由（`#/overview` 等）以适配 GitHub Pages。
- 启动时自动以管理员身份进入；所有接口由 `src/demo/mockApi.ts` 在浏览器内拦截并返回示例数据。
- 写操作只修改内存副本，刷新后恢复。

## 本地运行

```bash
npm ci
VITE_DEMO=1 npm run dev     # 本地演示模式
npm test
VITE_DEMO=1 npm run build   # 产物在 dist/
```

正常构建（连接真实后端）见主仓库的 `console/README.md`。
