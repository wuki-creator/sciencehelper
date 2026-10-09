# 课题到试剂的 RAG 匹配方案

## 目标与边界

研究方案生成后，平台把课题、论文题录、摘要和可获取的 Methods 片段作为查询上下文，从 GitHub 仓库的 `docs/bio-literature-topics-20000.jsonl` 和 `docs/bio-research-query-catalog-10000.jsonl` 召回相关文献主题，再对商城商品做可解释重排。10,000 条目录中的 `query` 是从对应文献 `sourceTitle` 转换出的用户口语化检索问题，`sourceTitle`、PMID/PMCID/DOI 负责证据追溯。口语化 query、`topicDescription` 和标题本身都不能单独证明某个商品在实验中有效。

因此，前端只在商品明确提供平台验证状态、质量分、成功率和验证证据数量时显示“已验证优选”。仅有文献相关性时显示“证据支持”；没有文献或平台验证记录时显示“平台待验证”。

## 生物学机制问题入口

2026-10-09 更新的 10,000 条 Query 目录聚焦信号调控、基因表达、细胞死亡、免疫、代谢、分化与疾病机制。用户问题询问机制、因果证据、上下游关系和证据缺口，不直接询问试剂、耗材或仪器。每条记录保留 `sourceTitle`、`literatureId`、PMID/DOI；`researchFocus`、`mechanismTopics`、`researchContexts` 和 `molecularEntities` 是从标题提取的检索标签，不能当作已验证关系。

机制检索先回答生物学问题并提供文献证据。后续用户进入研究方案时，再通过可获取的 Methods 建立实验方法与试剂之间的关联。Query 目录更新本身不代表已修改运行中的索引或接口；接入索引时需要按 PMID 关联原文，并核验摘要和全文证据。

## 计算流程

1. **构造上下文**：`课题 + 口语化 query + sourceTitle + 论文摘要前 1,200 字 + Methods 前 1,800 字`。Methods 智能体输出的试剂名称和用途会作为额外查询字段，仍保留对应 `paperIds` 和 PMID/DOI。
2. **RAG 召回**：中文文本使用单字/二元组，英文和货号使用词项。字段权重为 `title=5`、`topic=5`、`category=3`、`intent=2`、`query=2`、`description=1`；完整主题短语命中额外加 12 分，返回最多 8 条证据。
3. **实验环节对齐**：召回主题映射到 RNA 提取、逆转录、qPCR、建库、样本处理、蛋白与免疫、质控等环节。商品名称、品牌、类别、规格和标签也映射到同一组环节，计算 RAG 支持度。
4. **商品排序**：

   `总分 = 100 × (0.35 × 词项匹配 + 0.30 × RAG 环节支持 + 0.25 × 平台验证分 + 0.05 × 有库存 + 0.05 × 商品评分/5)`

   平台验证分为 `0.45 × 质量分 + 0.30 × 成功率 + 0.15 × log(1+证据数) + 0.10 × log(1+审核数)`，各项归一化到 0 到 1。

5. **等级门槛**：只有 `validationStatus ∈ {validated, verified, reviewed}` 且同时存在质量分、成功率、证据数，满足 `质量分 ≥ 80`、`成功率 ≥ 80%`、`证据数 ≥ 3` 时才是 `validated_best`。有 RAG 主题支持但未满足该门槛的是 `evidence_supported`，其余是 `candidate`。
6. **缺货处理**：缺货商品保留在备选结果中，但没有库存加分，不会因为评分高而遮蔽可购买商品。

## 平台数据字段

供应商同步和商家商品均支持以下字段：`validationStatus`、`qualityScore`、`successRate`、`evidenceCount`、`reviewCount`、`validationSource`。新发布商品默认 `validationStatus=candidate`，商家不能通过普通商品编辑接口自行写入验证结果；验证字段应来自平台复核、供应商接口或审核流程。

## 可追溯输出

每个方法节点的目录匹配包含 `matchScore`、`matchTier`、`reason`、`evidence`、`platformValidation`、`alternatives` 和 `ragSource`。`evidence` 中只保留召回记录的 ID、标题、来源链接、PMID/DOI 和分数，用户可以回到 PubMed 或 Europe PMC 复核。

## 冷启动与风险控制

- 20,000 条 JSONL 只在首次需要匹配时懒加载并建立内存索引；索引失败不会把无关商品推荐为匹配结果。
- 没有 Methods 全文时，平台仍可用题录和摘要做候选召回，但必须在证据说明中提示回到原文核验。
- 标题生成的课题描述不等于实验协议，不用于宣称“最佳试剂”。
- 平台验证字段缺失、冲突或仅有“已验证”文字时，最多显示“证据支持/平台待验证”。
