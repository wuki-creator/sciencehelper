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
- `docs/bio-research-query-catalog-10000.jsonl`：由 10,000 篇机制相关文献 title 转换出的口语化生物学问题，带 PMID/DOI 证据和 10 个检索入口
- `docs/bio-research-query-catalog-10000.md`：机制 query 的筛选与生成规则、字段说明和前 30 条示例
- `docs/bio-literature-topics-20000.jsonl`：20,000 条去重后的真实生物医学文献标题、课题描述、检索 query、PubMed/Europe PMC 元数据和可用 PDF 入口
- `scripts/generate-bio-query-catalog.cjs`：可复现生成上述目录的脚本
- `scripts/resolve-open-access-pdfs.cjs`：按 Europe PMC 开放获取结果解析每条 query 的实际 PDF 地址（需联网运行，避免伪造链接）
- `scripts/fetch-bio-literature-topics.cjs`：从 Europe PMC 分页抓取文献标题并生成课题描述；默认生成 20,000 条，可通过 `--count`、`--pageSize` 和 `--output` 调整
- `docs/sciencehelper-prd-v1.md`：科研任务、Native 支付、试剂采购与商家履约的页面级 PRD 和验收边界
- `docs/sciencehelper-growth-operations-2026.md`：受控试点、供给和渠道增长的运营方案；5 万用户是待验证目标
- `docs/reagent-rag-matching.md`：课题到试剂的 RAG 召回、验证门槛、排序公式和可追溯输出
- `public/poster.html`：面向客户推广的竖版海报，可直接打开或打印为 PDF

## 20,000 条文献课题目录

`bio-literature-topics-20000.jsonl` 的每行对应一篇真实的 PubMed/Europe PMC 文献。`bio-research-query-catalog-10000.jsonl` 从中筛选 10,000 篇机制相关文献，根据标题生成口语化问题，覆盖作用机制、上下游关系、因果证据、细胞背景和证据缺口，不直接询问材料或操作步骤。目录保留 `sourceTitle`、`literatureId`、`researchFocus`、`mechanismTopics`、`intent` 和文献标识；`generationSource=title-keyword-rules-v2`、`evidenceScope=title-only` 明确标记为标题规则生成。问题用于检索和意图识别，潜在关系仍需回到原文核验；新版本请通过 PMID 关联文献，避免沿用旧编号关系。

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
- 商家入驻 / 商家工作台：`/#merchantJoin`、`/#merchant`
- 模型管理后台：`/#modelAdmin`

商家通过登录页的“商家入驻”注册，或在普通账户中提交主体资料后进入商家工作台；商品、供应商目录和发货接口由服务端商家角色校验。商城运营后台已移除，模型管理后台仍需后续接入独立管理员角色、审计日志和权限策略。文献目录中的 URL 是检索或开放全文筛选入口，平台在展示可下载 PDF 前应再次校验开放获取和授权状态。

科研任务默认仅创建者可见，主动选择公开才展示课题描述。商城历史样例商品未绑定履约商家时不可在线购买。Native 支付必须由微信回调或查询确认，不能通过用户手动点击完成付款。

试剂推荐会读取 `docs/bio-literature-topics-20000.jsonl` 的文献主题作为 RAG 召回来源，并将课题词项、实验环节、库存和平台验证信息一起排序。只有平台明确提供验证状态、质量分、成功率和验证证据数量且达到门槛的商品才会标记为“已验证优选”；文献相关性本身不代表实验验证，详见 [`docs/reagent-rag-matching.md`](docs/reagent-rag-matching.md)。

## 验证

```powershell
node --check server.js
npm run build
node --test tests/order-flow.cjs
```

线上站点：<https://www.sciencehelper.cn>

推广海报：<https://www.sciencehelper.cn/poster.html>
