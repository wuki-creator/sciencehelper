# 生物科研口语化 Query 目录 10000 条

每条 query 由一篇真实 PubMed/Europe PMC 文献的 title 转换而来，保留原始标题、PMID/DOI 和来源链接，供 RAG 召回和证据追溯使用。

> 说明：口语化 query 是检索表达，不等于文献结论或实验协议。具体 Methods、参数和因果关系必须回到原文核验。

## 数据字段

- `query`：面向科研用户的自然语言问题。
- `sourceTitle`：生成该问题的原始文献标题。
- `method`：从标题和主题推断的实验方法标签。
- `intent`：实验方案、Methods 复现、试剂材料或设计分析意图。
- `pmid` / `pmcid` / `doi`：文献证据标识。
- `sources`：基于口语化 query 的检索入口。

## Query 生成规则

每条记录先读取一篇 PubMed/Europe PMC 文献的 `sourceTitle`，再从标题和主题中识别研究对象、实验方法和研究意图，转换成科研用户可能直接输入的问题。例如：

```text
文献标题：Analysis of relative gene expression data using real-time quantitative PCR...
口语化 Query：我想研究实验方法和检测结果，应该怎么做 qPCR？
```

生成的 query 用于 RAG 召回和意图识别。`sourceTitle`、`pmid`、`pmcid`、`doi` 和 `sourceUrl` 保留文献证据链；它们不表示该文献一定提供完整实验协议。没有摘要或 Methods 全文时，平台必须提示用户回到原文核验。

建议的用户输入类型包括：

- “我想研究……，应该怎么做……？”：按研究对象和方法检索。
- “我想分析……需要哪些实验步骤和关键参数？”：召回 Methods 和参数证据。
- “……需要哪些试剂、耗材和仪器？”：把方法节点连接到试剂 RAG。
- “我想复现这篇文献……”：按原始标题和 PMID 回溯文献。

完整机器可读数据见 `bio-research-query-catalog-10000.jsonl`。以下为前 20 条示例：

| ID | 口语化 Query | 原始文献标题 | PMID |
| --- | --- | --- | --- |
| BIOQ-00001 | 我想研究实验方法和检测结果，应该怎么做qPCR？ | Analysis of relative gene expression data using real-time quantitative PCR and the 2(-Delta Delta C(T)) Method. | 11846609 |
| BIOQ-00002 | 我想分析Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2，用RNA 测序需要哪些实验步骤和关键参数？ | Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. | 25516281 |
| BIOQ-00003 | 如果要检测疾病机制和表型，文献中的实验方法的样本处理、试剂和质控怎么设计？ | Global Cancer Statistics 2020: GLOBOCAN Estimates of Incidence and Mortality Worldwide for 36 Cancers in 185 Countries. | 33538338 |
| BIOQ-00004 | 我想复现这篇文献中关于疾病机制和表型的研究，文献中的实验方法需要准备什么？ | Global cancer statistics 2018: GLOBOCAN estimates of incidence and mortality worldwide for 36 cancers in 185 countries. | 30207593 |
| BIOQ-00005 | 针对Hallmarks of cancer the next generation，有哪些文献支持的文献中的实验方法方案？ | Hallmarks of cancer: the next generation. | 21376230 |
| BIOQ-00006 | 我想验证STAR ultrafast universal RNA-seq aligner的变化，RNA 测序如何选择对照、样本量和分析方法？ | STAR: ultrafast universal RNA-seq aligner. | 23104886 |
| BIOQ-00007 | 研究基因和转录组变化时，文献中的实验方法有哪些常见失败原因和优化办法？ | Gene set enrichment analysis: a knowledge-based approach for interpreting genome-wide expression profiles. | 16199517 |
| BIOQ-00008 | 我想从Highly accurate protein structure prediction with AlphaFold得到可靠结果，实验方法分析对应哪些试剂、耗材和仪器？ | Highly accurate protein structure prediction with AlphaFold. | 34265844 |
| BIOQ-00009 | 我想研究实验方法和检测结果，应该怎么做基因表达分析？ | edgeR: a Bioconductor package for differential expression analysis of digital gene expression data. | 19910308 |
| BIOQ-00010 | 我想分析基因和转录组变化，用RNA 测序需要哪些实验步骤和关键参数？ | limma powers differential expression analyses for RNA-sequencing and microarray studies. | 25605792 |
| BIOQ-00011 | 如果要检测Gene ontology tool for the unification of biology The Gene Ontology Consortium，文献中的实验方法的样本处理、试剂和质控怎么设计？ | Gene ontology: tool for the unification of biology. The Gene Ontology Consortium. | 10802651 |
| BIOQ-00012 | 我想复现这篇文献中关于clusterProfiler an R package for comparing biological themes among gene clusters的研究，文献中的实验方法需要准备什么？ | clusterProfiler: an R package for comparing biological themes among gene clusters. | 22455463 |
| BIOQ-00013 | 针对实验方法和检测结果，有哪些文献支持的实验方法分析方案？ | Systematic and integrative analysis of large gene lists using DAVID bioinformatics resources. | 19131956 |
| BIOQ-00014 | 我想验证基因和转录组变化的变化，全基因组测序如何选择对照、样本量和分析方法？ | PLINK: a tool set for whole-genome association and population-based linkage analyses. | 17701901 |
| BIOQ-00015 | 研究The Protein Data Bank时，文献中的实验方法有哪些常见失败原因和优化办法？ | The Protein Data Bank. | 10592235 |
| BIOQ-00016 | 我想从Global cancer statistics得到可靠结果，文献中的实验方法对应哪些试剂、耗材和仪器？ | Global cancer statistics. | 21296855 |
| BIOQ-00017 | 我想研究疾病机制和表型，应该怎么做文献中的实验方法？ | Global cancer statistics 2022: GLOBOCAN estimates of incidence and mortality worldwide for 36 cancers in 185 countries. | 38572751 |
| BIOQ-00018 | 我想分析生物医学问题，用文献中的实验方法需要哪些实验步骤和关键参数？ | The SILVA ribosomal RNA gene database project: improved data processing and web-based tools. | 23193283 |
| BIOQ-00019 | 如果要检测细胞和空间分布，文献中的实验方法的样本处理、试剂和质控怎么设计？ | SPAdes: a new genome assembly algorithm and its applications to single-cell sequencing. | 22506599 |
| BIOQ-00020 | 我想复现这篇文献中关于Global cancer statistics 2012的研究，文献中的实验方法需要准备什么？ | Global cancer statistics, 2012. | 25651787 |
