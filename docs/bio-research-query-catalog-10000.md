# 生物学机制口语化 Query 目录 10000 条

更新：2026-10-09。以真实 PubMed/Europe PMC 文献标题为来源，生成研究机制的用户口语化问题。完整数据见 [JSONL](bio-research-query-catalog-10000.jsonl)。

## 提问范围

围绕信号调控、基因表达、免疫应答、细胞死亡、代谢、表观遗传、细胞分化、肿瘤转移和微生物群等主题，询问作用机制、上下游关系、因果证据、时序、细胞背景、替代解释与证据缺口。Query 不直接询问试剂、耗材、仪器、采购或实验操作步骤。

## 标题到问题的转换

1. 从 20,000 条文献目录筛选机制相关标题，排除统计、诊断、预后及临床试验类标题，取前 10,000 篇；新编号对应的文献可能与旧版不同，请用 PMID 或 literatureId 关联原文。
2. 只根据标题实际出现的关键词识别分子、细胞过程和研究背景，形成 researchFocus。
3. 把主题转换为口语化机制问题；相同主题尝试不同意图，仍重复时带入原始标题以保留文献特异性。
4. 保留 sourceTitle 和 PMID/PMCID/DOI。外部检索入口使用英文标题 searchQuery，以便在文献数据库中检索。

这是基于标题关键词的规则生成目录，尚未逐条人工复核。问题中的潜在关系是待检索假设，不代表论文已经证明的结论。缺少可识别中文主题时保留原始英文标题，不臆造疾病、分子关系或实验细节。

## 数据字段

| 字段 | 含义 |
| --- | --- |
| query / intent | 口语化机制问题及提问意图 |
| sourceTitle / literatureId | 原始文献标题与文献目录 ID |
| researchFocus | 从标题提取的主题 |
| mechanismTopics / researchContexts / molecularEntities | 标题命中的过程、背景和分子标签，仅作检索提示 |
| generationSource / evidenceScope | title-keyword-rules-v2 / title-only，说明生成与证据范围 |
| searchQuery / sources | 英文标题检索表达与 10 个公开检索入口 |
| pmid / pmcid / doi / sourceUrl | 文献追溯字段 |

## 校验与复现

校验 10,000 条记录、10,000 个唯一 Query 与 PMID，检查提问中没有材料或操作请求，并核对与原始文献的标题和 PMID 对应。生成命令：

    node scripts/generate-bio-query-catalog.cjs

## 示例

| ID | 口语化机制问题 | 原始文献标题 | PMID |
| --- | --- | --- | --- |
| BIOQ-00001 | 我想了解肿瘤发生的核心特征，背后的生物学机制是什么？ | Hallmarks of cancer: the next generation. | [21376230](https://pubmed.ncbi.nlm.nih.gov/21376230/) |
| BIOQ-00002 | 肿瘤发生的核心特征是怎样被调控的？有哪些关键分子参与？ | The hallmarks of cancer. | [10647931](https://pubmed.ncbi.nlm.nih.gov/10647931/) |
| BIOQ-00003 | 关于铁死亡与细胞死亡，目前有哪些因果证据，哪些还只是相关性？ | Ferroptosis: an iron-dependent form of nonapoptotic cell death. | [22632970](https://pubmed.ncbi.nlm.nih.gov/22632970/) |
| BIOQ-00004 | 我想研究病毒相关研究中的ACE2、TMPRSS2相关的细胞入侵，有哪些值得进一步探究的机制假设？ | SARS-CoV-2 Cell Entry Depends on ACE2 and TMPRSS2 and Is Blocked by a Clinically Proven Protease Inhibitor. | [32142651](https://pubmed.ncbi.nlm.nih.gov/32142651/) |
| BIOQ-00005 | 微小 RNA 调控涉及哪些上下游调控关系？现有文献支持到什么程度？ | MicroRNAs: target recognition and regulatory functions. | [19167326](https://pubmed.ncbi.nlm.nih.gov/19167326/) |
| BIOQ-00006 | 为什么细胞增殖与代谢调控在不同细胞类型或生理状态下可能表现不同？ | Understanding the Warburg effect: the metabolic requirements of cell proliferation. | [19460998](https://pubmed.ncbi.nlm.nih.gov/19460998/) |
| BIOQ-00007 | 关于巨噬细胞与B 细胞相关研究中的转录调控，不同研究有哪些分歧，可能的解释是什么？ | Simple combinations of lineage-determining transcription factors prime cis-regulatory elements required for macrophage and B cell identities. | [20513432](https://pubmed.ncbi.nlm.nih.gov/20513432/) |
| BIOQ-00008 | 我想弄清细胞分化，哪些环节可能是机制中的关键节点？ | Transcript assembly and quantification by RNA-Seq reveals unannotated transcripts and isoform switching during cell differentiation. | [20436464](https://pubmed.ncbi.nlm.nih.gov/20436464/) |
| BIOQ-00009 | 细菌相关研究中的免疫应答随时间怎样变化？哪些变化可能是原因，哪些是后果？ | A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity. | [22745249](https://pubmed.ncbi.nlm.nih.gov/22745249/) |
| BIOQ-00010 | 目前对肿瘤相关研究中的炎症反应的解释有哪些？有没有其他可能的机制？ | Inflammation and cancer. | [12490959](https://pubmed.ncbi.nlm.nih.gov/12490959/) |
| BIOQ-00011 | 肿瘤相关研究中的免疫检查点是否依赖细胞状态或生物学背景？有哪些文献依据？ | The blockade of immune checkpoints in cancer immunotherapy. | [22437870](https://pubmed.ncbi.nlm.nih.gov/22437870/) |
| BIOQ-00012 | 关于细胞凋亡与细胞死亡，哪些机制已有支持，哪些问题还没有解决？ | Apoptosis: a review of programmed cell death. | [17562483](https://pubmed.ncbi.nlm.nih.gov/17562483/) |
| BIOQ-00013 | 我想了解肿瘤相关研究中的MicroRNA-23b相关的微小 RNA 调控与细胞侵袭，背后的生物学机制是什么？ | MicroRNA-23b regulates cellular architecture and impairs motogenic and invasive phenotypes during cancer progression. | [24002530](https://pubmed.ncbi.nlm.nih.gov/24002530/) |
| BIOQ-00014 | 植物相关研究中的免疫应答是怎样被调控的？有哪些关键分子参与？ | The plant immune system. | [17108957](https://pubmed.ncbi.nlm.nih.gov/17108957/) |
| BIOQ-00015 | 关于肥胖与肠道相关研究中的微生物群的作用，目前有哪些因果证据，哪些还只是相关性？ | An obesity-associated gut microbiome with increased capacity for energy harvest. | [17183312](https://pubmed.ncbi.nlm.nih.gov/17183312/) |
| BIOQ-00016 | 我想研究微生物群的作用，有哪些值得进一步探究的机制假设？ | Structure, function and diversity of the healthy human microbiome. | [22699609](https://pubmed.ncbi.nlm.nih.gov/22699609/) |
| BIOQ-00017 | 肿瘤相关研究中的炎症反应涉及哪些上下游调控关系？现有文献支持到什么程度？ | Cancer-related inflammation. | [18650914](https://pubmed.ncbi.nlm.nih.gov/18650914/) |
| BIOQ-00018 | 为什么肺癌相关研究中的基因突变在不同细胞类型或生理状态下可能表现不同？ | Activating mutations in the epidermal growth factor receptor underlying responsiveness of non-small-cell lung cancer to gefitinib. | [15118073](https://pubmed.ncbi.nlm.nih.gov/15118073/) |
| BIOQ-00019 | 关于肿瘤相关研究中的免疫应答与炎症反应，不同研究有哪些分歧，可能的解释是什么？ | Immunity, inflammation, and cancer. | [20303878](https://pubmed.ncbi.nlm.nih.gov/20303878/) |
| BIOQ-00020 | 我想弄清肿瘤相关研究中的基因突变，哪些环节可能是机制中的关键节点？ | Signatures of mutational processes in human cancer. | [23945592](https://pubmed.ncbi.nlm.nih.gov/23945592/) |
| BIOQ-00021 | 乳腺癌相关研究中的HER2相关的肿瘤转移随时间怎样变化？哪些变化可能是原因，哪些是后果？ | Use of chemotherapy plus a monoclonal antibody against HER2 for metastatic breast cancer that overexpresses HER2. | [11248153](https://pubmed.ncbi.nlm.nih.gov/11248153/) |
| BIOQ-00022 | 目前对乳腺癌相关研究中的基因表达调控的解释有哪些？有没有其他可能的机制？ | Gene expression patterns of breast carcinomas distinguish tumor subclasses with clinical implications. | [11553815](https://pubmed.ncbi.nlm.nih.gov/11553815/) |
| BIOQ-00023 | 肿瘤相关的生物学变化是否依赖细胞状态或生物学背景？有哪些文献依据？ | Inferring tumour purity and stromal and immune cell admixture from expression data. | [24113773](https://pubmed.ncbi.nlm.nih.gov/24113773/) |
| BIOQ-00024 | 关于肿瘤相关研究中的BRAF相关的基因突变，哪些机制已有支持，哪些问题还没有解决？ | Mutations of the BRAF gene in human cancer. | [12068308](https://pubmed.ncbi.nlm.nih.gov/12068308/) |
| BIOQ-00025 | 我想了解肺癌相关的生物学变化，背后的生物学机制是什么？ | Nivolumab versus Docetaxel in Advanced Nonsquamous Non-Small-Cell Lung Cancer. | [26412456](https://pubmed.ncbi.nlm.nih.gov/26412456/) |
| BIOQ-00026 | 乳腺癌相关的生物学变化是怎样被调控的？有哪些关键分子参与？ | Prospective identification of tumorigenic breast cancer cells. | [12629218](https://pubmed.ncbi.nlm.nih.gov/12629218/) |
| BIOQ-00027 | 关于肿瘤发生的核心特征，目前有哪些因果证据，哪些还只是相关性？ | Hallmarks of Cancer: New Dimensions. | [35022204](https://pubmed.ncbi.nlm.nih.gov/35022204/) |
| BIOQ-00028 | 我想研究肠道相关研究中的微生物群的作用，有哪些值得进一步探究的机制假设？ | Diet rapidly and reproducibly alters the human gut microbiome. | [24336217](https://pubmed.ncbi.nlm.nih.gov/24336217/) |
| BIOQ-00029 | 结直肠癌相关研究中的肿瘤转移涉及哪些上下游调控关系？现有文献支持到什么程度？ | Bevacizumab plus irinotecan, fluorouracil, and leucovorin for metastatic colorectal cancer. | [15175435](https://pubmed.ncbi.nlm.nih.gov/15175435/) |
| BIOQ-00030 | 为什么肺癌相关研究中的EGFR相关的基因突变在不同细胞类型或生理状态下可能表现不同？ | EGFR mutations in lung cancer: correlation with clinical response to gefitinib therapy. | [15118125](https://pubmed.ncbi.nlm.nih.gov/15118125/) |
