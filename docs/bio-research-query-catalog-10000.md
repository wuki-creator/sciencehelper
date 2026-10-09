# 疾病、表型与生物学机制口语化 Query 目录 10000 条

更新：2026-10-09。以真实 PubMed/Europe PMC 文献标题为来源，生成同时涉及疾病背景、表型和机制的用户口语化问题。完整数据见 [JSONL](bio-research-query-catalog-10000.jsonl)。

## 提问范围

每条 Query 都从疾病背景和可观察表型出发，继续询问分子、细胞过程与表型之间的关系。问题覆盖疾病发生发展、表型关联、调控关系、因果证据、时序差异、细胞背景、机制争议和证据缺口；不直接询问试剂、耗材、仪器、采购或实验操作步骤。

## 标题到问题的转换

1. 从 20,000 条文献目录筛选机制相关标题，排除统计、诊断、预后及临床试验类标题，取前 10,000 篇；新编号对应的文献可能与旧版不同，请用 PMID 或 literatureId 关联原文。
2. 只根据标题中的明确词语提取 diseases、phenotypes、molecularEntities 和 mechanismTopics；标题未提及的疾病或表型分别使用通用疾病语境或按文献主题生成的表型回退，不伪装成原文事实。机制词不会被当作表型。
3. 每条问题同时包含疾病语境和表型，再询问其与分子/机制主题的关系；相同主题尝试不同提问意图，仍重复时带入原始标题以保留文献特异性。
4. 保留 sourceTitle 和 PMID/PMCID/DOI。外部检索入口使用英文标题 searchQuery，以便在文献数据库中检索。

这是基于标题关键词的规则生成目录，尚未逐条人工复核。疾病和表型字段区分标题直接提取与通用回退；通用回退只是提问入口。问题中的潜在关系是待检索假设，不代表论文已经证明的结论。
本批 10,000 条记录中，标题直接提取疾病词条 5526 条、直接提取表型词条 3221 条；其余记录使用已标记的通用疾病语境或主题表型回退。

## 数据字段

| 字段 | 含义 |
| --- | --- |
| query / intent | 口语化机制问题及提问意图 |
| sourceTitle / literatureId | 原始文献标题与文献目录 ID |
| researchFocus | 从标题提取的主题 |
| diseaseContext / diseases | 提问所用疾病语境；diseases 仅收录标题直接提取项 |
| phenotypeFocus / phenotypes | 提问所用表型短语，可使用主题回退或按疾病语境调整；phenotypes 仅收录标题直接提取项 |
| diseaseContextSource / phenotypeSource | 标记标题提取或通用回退来源 |
| mechanismTopics / researchContexts / molecularEntities | 标题命中的过程、细胞背景和分子标签，仅作检索提示 |
| generationSource / evidenceScope | title-keyword-rules-v3 / title-only，说明生成与证据范围 |
| searchQuery / sources | 英文标题检索表达与 10 个公开检索入口 |
| pmid / pmcid / doi / sourceUrl | 文献追溯字段 |

## 校验与复现

校验 10,000 条记录、10,000 个唯一 Query 与 PMID，检查每个问题均涉及疾病和表型语境、没有材料或操作请求，并核对与原始文献的标题和 PMID 对应。生成命令：

    node scripts/generate-bio-query-catalog.cjs

## 示例

| ID | 口语化机制问题 | 原始文献标题 | PMID |
| --- | --- | --- | --- |
| BIOQ-00001 | 我想了解肿瘤中的发生发展相关表型，它与肿瘤进展机制可能有什么联系？ | Hallmarks of cancer: the next generation. | [21376230](https://pubmed.ncbi.nlm.nih.gov/21376230/) |
| BIOQ-00002 | 肿瘤发生发展过程中，发生发展相关表型可能由哪些生物学过程调控？肿瘤进展机制是否参与其中？ | The hallmarks of cancer. | [10647931](https://pubmed.ncbi.nlm.nih.gov/10647931/) |
| BIOQ-00003 | 疾病背景下的铁死亡表型可能受哪些因素调控？细胞死亡是否参与？ | Ferroptosis: an iron-dependent form of nonapoptotic cell death. | [22632970](https://pubmed.ncbi.nlm.nih.gov/22632970/) |
| BIOQ-00004 | 关于COVID-19中的病原体入侵表型，ACE2、TMPRSS2相关的细胞入侵是致因、结果，还是仅与其相关？有哪些证据？ | SARS-CoV-2 Cell Entry Depends on ACE2 and TMPRSS2 and Is Blocked by a Clinically Proven Protease Inhibitor. | [32142651](https://pubmed.ncbi.nlm.nih.gov/32142651/) |
| BIOQ-00005 | 疾病背景下的细胞功能或组织状态表型为什么会因细胞类型或疾病阶段不同而变化？微小 RNA 调控可能起什么作用？ | MicroRNAs: target recognition and regulatory functions. | [19167326](https://pubmed.ncbi.nlm.nih.gov/19167326/) |
| BIOQ-00006 | 疾病发生发展时，细胞增殖表型与代谢调控可能有哪些上下游关系？ | Understanding the Warburg effect: the metabolic requirements of cell proliferation. | [19460998](https://pubmed.ncbi.nlm.nih.gov/19460998/) |
| BIOQ-00007 | 疾病进展时，细胞命运表型可能如何变化？转录调控可能对哪些细胞功能产生影响？ | Simple combinations of lineage-determining transcription factors prime cis-regulatory elements required for macrophage and B cell identities. | [20513432](https://pubmed.ncbi.nlm.nih.gov/20513432/) |
| BIOQ-00008 | 关于疾病背景下的细胞分化表型，不同研究对RNA 异构体转换有哪些不同解释？ | Transcript assembly and quantification by RNA-Seq reveals unannotated transcripts and isoform switching during cell differentiation. | [20436464](https://pubmed.ncbi.nlm.nih.gov/20436464/) |
| BIOQ-00009 | 疾病背景下的免疫应答表型涉及哪些关键机制？细菌适应性免疫可能处于哪个环节？ | A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity. | [22745249](https://pubmed.ncbi.nlm.nih.gov/22745249/) |
| BIOQ-00010 | 肿瘤中的炎症表型会随时间如何变化？这项研究涉及的生物学过程可能先于还是晚于这种变化？ | Inflammation and cancer. | [12490959](https://pubmed.ncbi.nlm.nih.gov/12490959/) |
| BIOQ-00011 | 除免疫检查点外，还有哪些机制可能解释肿瘤中的细胞功能表型？ | The blockade of immune checkpoints in cancer immunotherapy. | [22437870](https://pubmed.ncbi.nlm.nih.gov/22437870/) |
| BIOQ-00012 | 关于疾病背景下的细胞凋亡表型，细胞死亡方面已知什么，还有哪些问题待解决？ | Apoptosis: a review of programmed cell death. | [17562483](https://pubmed.ncbi.nlm.nih.gov/17562483/) |
| BIOQ-00013 | 我想了解肿瘤中的生长或进展表型，它与MicroRNA-23b相关的微小 RNA 调控与细胞侵袭可能有什么联系？ | MicroRNA-23b regulates cellular architecture and impairs motogenic and invasive phenotypes during cancer progression. | [24002530](https://pubmed.ncbi.nlm.nih.gov/24002530/) |
| BIOQ-00014 | 肥胖相关疾病发生发展过程中，肥胖表型可能由哪些生物学过程调控？微生物群的作用是否参与其中？ | An obesity-associated gut microbiome with increased capacity for energy harvest. | [17183312](https://pubmed.ncbi.nlm.nih.gov/17183312/) |
| BIOQ-00015 | 疾病背景下的感染过程或宿主反应表型可能受哪些因素调控？微生物群的作用是否参与？ | Structure, function and diversity of the healthy human microbiome. | [22699609](https://pubmed.ncbi.nlm.nih.gov/22699609/) |
| BIOQ-00016 | 关于肿瘤中的炎症表型，这项研究涉及的生物学过程是致因、结果，还是仅与其相关？有哪些证据？ | Cancer-related inflammation. | [18650914](https://pubmed.ncbi.nlm.nih.gov/18650914/) |
| BIOQ-00017 | 非小细胞肺癌中的治疗反应表型为什么会因细胞类型或疾病阶段不同而变化？基因突变可能起什么作用？ | Activating mutations in the epidermal growth factor receptor underlying responsiveness of non-small-cell lung cancer to gefitinib. | [15118073](https://pubmed.ncbi.nlm.nih.gov/15118073/) |
| BIOQ-00018 | 肿瘤发生发展时，炎症表型与免疫应答可能有哪些上下游关系？ | Immunity, inflammation, and cancer. | [20303878](https://pubmed.ncbi.nlm.nih.gov/20303878/) |
| BIOQ-00019 | 肿瘤进展时，细胞功能表型可能如何变化？基因突变可能对哪些细胞功能产生影响？ | Signatures of mutational processes in human cancer. | [23945592](https://pubmed.ncbi.nlm.nih.gov/23945592/) |
| BIOQ-00020 | 关于乳腺癌中的细胞功能表型，不同研究对基因表达调控有哪些不同解释？ | Gene expression patterns of breast carcinomas distinguish tumor subclasses with clinical implications. | [11553815](https://pubmed.ncbi.nlm.nih.gov/11553815/) |
| BIOQ-00021 | 肿瘤相关的细胞组成表型涉及哪些关键机制？这项研究涉及的生物学过程可能处于哪个环节？ | Inferring tumour purity and stromal and immune cell admixture from expression data. | [24113773](https://pubmed.ncbi.nlm.nih.gov/24113773/) |
| BIOQ-00022 | 肿瘤中的细胞功能表型会随时间如何变化？BRAF相关的基因突变可能先于还是晚于这种变化？ | Mutations of the BRAF gene in human cancer. | [12068308](https://pubmed.ncbi.nlm.nih.gov/12068308/) |
| BIOQ-00023 | 除致瘤机制外，还有哪些机制可能解释乳腺癌中的致瘤性表型？ | Prospective identification of tumorigenic breast cancer cells. | [12629218](https://pubmed.ncbi.nlm.nih.gov/12629218/) |
| BIOQ-00024 | 关于肿瘤中的发生发展相关表型，肿瘤进展机制方面已知什么，还有哪些问题待解决？ | Hallmarks of Cancer: New Dimensions. | [35022204](https://pubmed.ncbi.nlm.nih.gov/35022204/) |
| BIOQ-00025 | 我想了解疾病背景下的感染过程或宿主反应表型，它与微生物群的作用可能有什么联系？ | Diet rapidly and reproducibly alters the human gut microbiome. | [24336217](https://pubmed.ncbi.nlm.nih.gov/24336217/) |
| BIOQ-00026 | 肺癌发生发展过程中，细胞功能表型可能由哪些生物学过程调控？EGFR相关的基因突变是否参与其中？ | EGFR mutations in lung cancer: correlation with clinical response to gefitinib therapy. | [15118125](https://pubmed.ncbi.nlm.nih.gov/15118125/) |
| BIOQ-00027 | 疾病背景下的基因表达或细胞功能表型可能受哪些因素调控？分子或细胞互作是否参与？ | Comprehensive mapping of long-range interactions reveals folding principles of the human genome. | [19815776](https://pubmed.ncbi.nlm.nih.gov/19815776/) |
| BIOQ-00028 | 关于疾病背景下的细胞多能性表型，干细胞功能是致因、结果，还是仅与其相关？有哪些证据？ | Induced pluripotent stem cell lines derived from human somatic cells. | [18029452](https://pubmed.ncbi.nlm.nih.gov/18029452/) |
| BIOQ-00029 | 肿瘤中的细胞功能表型为什么会因细胞类型或疾病阶段不同而变化？微小 RNA 调控可能起什么作用？ | MicroRNA expression profiles classify human cancers. | [15944708](https://pubmed.ncbi.nlm.nih.gov/15944708/) |
| BIOQ-00030 | 肿瘤发生发展时，细胞功能表型与这项研究涉及的生物学过程可能有哪些上下游关系？ | Comprehensive molecular characterization of human colon and rectal cancer. | [22810696](https://pubmed.ncbi.nlm.nih.gov/22810696/) |
