# ScienceHelper / PaperPilot

ScienceHelper 是面向科研人员的研究方案、文献证据、Methods 方法树、试剂采购和实验服务平台。当前版本保留研究方案工作流、PubMed 证据和方法树，并提供试剂商城、商家后台、实验服务、实验室后台和订单管理。

## 本地运行

环境要求：Node.js 18 或更高版本。

```powershell
npm install
npm run build
npm start
```

然后打开 <http://localhost:3000>。本地配置复制 `.env.example` 为 `.env`，不要把 `.env` 或 `data/` 中的运行数据提交到仓库。

## 目录

- `src/`：React 前端源码
- `server.js`：Node.js API 与静态资源服务
- `research_model/`：研究网络训练、推理服务和数据处理代码
- `ml/`：适配器训练与模型服务脚本
- `deploy/`：systemd、Nginx 和云主机部署配置
- `scripts/build.cjs`：前端构建脚本

## 验证

```powershell
node --check server.js
npm run build
```

线上站点：<https://www.sciencehelper.cn>
