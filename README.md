# ScienceHelper / PaperPilot

ScienceHelper 是面向科研人员的研究方案、文献证据、Methods 方法树、试剂采购和实验服务平台。当前版本保留研究方案工作流、PubMed 证据和方法树，并提供试剂商城、商家后台、实验服务、实验室后台和订单管理。商城用户端、商城运营后台和模型管理后台使用独立的工作台壳层与路由，避免运营数据和科研工作流混在一起。

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
- `docs/bio-research-query-catalog-10000.jsonl`：10,000 条生物科研常规 query 与 10 个文献检索/开放全文入口
- `docs/bio-research-query-catalog-10000.md`：数据字段说明和前 20 条可读示例
- `docs/bio-literature-topics-20000.jsonl`：20,000 条去重后的真实生物医学文献标题、课题描述、检索 query、PubMed/Europe PMC 元数据和可用 PDF 入口
- `scripts/generate-bio-query-catalog.cjs`：可复现生成上述目录的脚本
- `scripts/resolve-open-access-pdfs.cjs`：按 Europe PMC 开放获取结果解析每条 query 的实际 PDF 地址（需联网运行，避免伪造链接）
- `scripts/fetch-bio-literature-topics.cjs`：从 Europe PMC 分页抓取文献标题并生成课题描述；默认生成 20,000 条，可通过 `--count`、`--pageSize` 和 `--output` 调整

## 20,000 条文献课题目录

`bio-literature-topics-20000.jsonl` 的每行对应一篇真实的 PubMed/Europe PMC 文献，包含 `title`、`topicDescription`、`query`、`category`、`pmid`、`doi`、`journal`、`year`、`authors`、`sourceUrl` 和 `pdfUrl` 等字段。课题描述和 query 由标题模板生成，用于平台检索和选题初筛；文件中的 `descriptionSource` 已明确标注这一点，具体结论、参数和因果关系仍需回到原文核验。

如需重新抓取：

```powershell
node scripts/fetch-bio-literature-topics.cjs `
  --count 20000 `
  --pageSize 1000 `
  --output docs/bio-literature-topics-20000.jsonl
```

数据源为 Europe PMC 的 PubMed 文献记录。`pdfUrl` 仅在返回可解析的全文 PDF 入口时填写；是否可以下载、使用和再分发，应以对应出版商或开放获取许可为准。

## 工作台入口

- 用户端商城：`/#market`
- 商城运营后台：`/#marketAdmin`
- 模型管理后台：`/#modelAdmin`

后台入口当前沿用现有登录会话；生产环境应继续接入独立的管理员角色、审计日志和权限策略。文献目录中的 URL 是检索或开放全文筛选入口，平台在展示可下载 PDF 前应再次校验开放获取和授权状态。

## 验证

```powershell
node --check server.js
npm run build
```

线上站点：<https://www.sciencehelper.cn>
