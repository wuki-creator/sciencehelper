const fs = require('node:fs');
const path = require('node:path');
const docs = path.join(__dirname, '..', 'docs');
const COUNT = 10000;
const clean = v => String(v || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const mechanismPattern = /regulat|signal|pathway|mechanis|activat|suppress|promot|inhibit|mediat|induc|modulat|interact|differentiat|apopto|autophag|metasta|resistan|inflamm|immun|metabol|epigen|microbiot|microbiom|cell death|tumor|cancer/i;
const excludedPattern = /randomi[sz]ed|phase [123iv]+|clinical trial|incidence|mortality|statistics|guideline|meta-analysis|systematic review|survival|prognos|diagnos|risk prediction|risk score|GLOBOCAN|worldwide burden|patient.*perspective|supportive care|navigation|quality of life|versus.*chemotherapy|safety,|web server|web tool|database|portal|software|R package|QIIME|phyloseq|STRING v|bioinformatics|data science/i;

// Labels are retrieval hints derived only from title keywords, not scientific conclusions.
const processRules = [
  [/ferropto/i, '铁死亡'], [/pyropto/i, '细胞焦亡'], [/necropto/i, '程序性坏死'],
  [/\bapopto/i, '细胞凋亡'], [/autophag/i, '细胞自噬'], [/cell death/i, '细胞死亡'],
  [/immune evasion|immune escape/i, '免疫逃逸'], [/immune suppress|immunosuppress/i, '免疫抑制'],
  [/immune checkpoint/i, '免疫检查点'], [/immune response|immune system|immunity/i, '免疫应答'],
  [/innate immun/i, '先天免疫'], [/adaptive immun/i, '适应性免疫'],
  [/inflamm/i, '炎症反应'], [/inflammasome/i, '炎症小体'], [/antigen presentation/i, '抗原呈递'],
  [/T[- ]cell exhaustion/i, 'T 细胞耗竭'], [/T[- ]cell activat/i, 'T 细胞活化'],
  [/macrophage polarization/i, '巨噬细胞极化'], [/cytokine/i, '细胞因子调控'],
  [/epigen/i, '表观遗传调控'], [/DNA methylat/i, 'DNA 甲基化'],
  [/histone/i, '组蛋白调控'], [/chromatin/i, '染色质调控'],
  [/transcription/i, '转录调控'], [/gene expression/i, '基因表达调控'],
  [/mutation/i, '基因突变'], [/hallmarks of cancer/i, '肿瘤发生的核心特征'],
  [/microRNA|miRNA/i, '微小 RNA 调控'], [/long non.?coding|lncRNA/i, '长链非编码 RNA 调控'],
  [/RNA splic/i, 'RNA 剪接'], [/translation/i, '蛋白质翻译'],
  [/DNA damage/i, 'DNA 损伤应答'], [/DNA repair/i, 'DNA 修复'],
  [/genom(?:e|ic) instability/i, '基因组不稳定性'], [/cell cycle/i, '细胞周期'],
  [/senesc/i, '细胞衰老'], [/aging|ageing/i, '生物衰老'],
  [/differentiat/i, '细胞分化'], [/pluripoten/i, '细胞多能性'],
  [/self[- ]renew/i, '细胞自我更新'], [/regenerat/i, '组织再生'],
  [/proliferat/i, '细胞增殖'], [/cell migration/i, '细胞迁移'],
  [/invas(?:ion|ive)/i, '细胞侵袭'], [/metasta/i, '肿瘤转移'],
  [/angiogen/i, '血管生成'], [/epithelial.?mesenchymal|\bEMT\b/i, '上皮间质转化'],
  [/tumou?r microenvironment/i, '肿瘤微环境'], [/stem cell/i, '干细胞功能'],
  [/drug resistan|chemoresistan/i, '药物耐受'], [/resistan/i, '耐受或抵抗'],
  [/oxidative stress/i, '氧化应激'], [/reactive oxygen|\bROS\b/i, '活性氧调控'],
  [/hypoxi/i, '缺氧应答'], [/mitochondri/i, '线粒体功能'],
  [/glycolys/i, '糖酵解'], [/lipid metabol/i, '脂质代谢'],
  [/glucose metabol/i, '葡萄糖代谢'], [/energy metabol/i, '能量代谢'],
  [/metabol/i, '代谢调控'], [/ubiquitin/i, '泛素化调控'],
  [/phosphorylat/i, '磷酸化调控'], [/protein degrad/i, '蛋白质降解'],
  [/protein fold|misfold/i, '蛋白质折叠'], [/endoplasmic reticulum stress/i, '内质网应激'],
  [/exosom|extracellular vesicle/i, '细胞外囊泡介导的通讯'],
  [/cell[- ]cell|cellular communication|cell communication/i, '细胞间通讯'],
  [/microbiom|microbiota/i, '微生物群的作用'], [/synap/i, '突触功能'],
  [/neurodegener/i, '神经退行性变化'], [/fibros/i, '纤维化'],
  [/cell entry/i, '细胞入侵'], [/nutrient/i, '营养感知'],
  [/signal|pathway/i, '信号通路调控'], [/interact/i, '分子或细胞互作']
];
const contextRules = [
  [/breast cancer|breast carcinoma/i, '乳腺癌'], [/lung cancer|lung carcinoma/i, '肺癌'],
  [/colorectal|colon cancer/i, '结直肠癌'], [/pancreatic/i, '胰腺'],
  [/hepatocellular|liver cancer/i, '肝癌'], [/prostate/i, '前列腺'],
  [/ovarian/i, '卵巢'], [/gastric/i, '胃'], [/glioma|glioblastoma/i, '胶质瘤'],
  [/melanoma/i, '黑色素瘤'], [/leukemia|leukaemia/i, '白血病'],
  [/lymphoma/i, '淋巴瘤'], [/Alzheimer/i, '阿尔茨海默病'], [/Parkinson/i, '帕金森病'],
  [/diabet/i, '糖尿病'], [/obes/i, '肥胖'], [/atheroscleros/i, '动脉粥样硬化'],
  [/autoimmun/i, '自身免疫'], [/gut|intestinal/i, '肠道'],
  [/liver|hepatic/i, '肝脏'], [/kidney|renal/i, '肾脏'], [/heart|cardiac/i, '心脏'],
  [/brain|cerebr/i, '脑'], [/neuron|neuronal/i, '神经元'], [/macrophage/i, '巨噬细胞'],
  [/dendritic cell/i, '树突状细胞'], [/T[- ]cell/i, 'T 细胞'], [/B[- ]cell/i, 'B 细胞'],
  [/endothelial/i, '内皮细胞'], [/epithelial/i, '上皮细胞'], [/fibroblast/i, '成纤维细胞'],
  [/tumou?r|cancer|carcinoma/i, '肿瘤'], [/bacter/i, '细菌'], [/viral|virus|SARS-CoV/i, '病毒'], [/plant/i, '植物']
];
const entityRules = [
  [/\bmTOR\b/i, 'mTOR'], [/\bPI3K\b/i, 'PI3K'], [/\bAKT\b/i, 'AKT'],
  [/\bMAPK\b/i, 'MAPK'], [/\bERK\b/i, 'ERK'], [/\bNF[- ]?kappa[- ]?B\b|\bNF-κB\b/i, 'NF-κB'],
  [/\bJAK\b/i, 'JAK'], [/\bSTAT[1-6]?\b/i, null], [/\bWnt\b/i, 'Wnt'],
  [/beta[- ]catenin|β-catenin/i, 'β-catenin'], [/\bNotch\b/i, 'Notch'],
  [/\bHedgehog\b/i, 'Hedgehog'], [/\bHippo\b/i, 'Hippo'], [/\bYAP\b/i, 'YAP'],
  [/\bTGF[- ]?(?:beta|β)\b/i, 'TGF-β'], [/\bp53\b/i, 'p53'], [/\bTP53\b/i, 'TP53'],
  [/\bKRAS\b/i, 'KRAS'], [/\bBRAF\b/i, 'BRAF'], [/\bEGFR\b/i, 'EGFR'],
  [/\bHER2\b/i, 'HER2'], [/\bMYC\b/i, 'MYC'], [/\bBRCA[12]\b/i, null],
  [/\bPD-1\b/i, 'PD-1'], [/\bPD-L1\b/i, 'PD-L1'], [/\bCTLA-4\b/i, 'CTLA-4'],
  [/\bNLRP3\b/i, 'NLRP3'], [/\bSTING\b/i, 'STING'], [/\bcGAS\b/i, 'cGAS'],
  [/\bGSDMD\b/i, 'GSDMD'], [/\bGPX4\b/i, 'GPX4'], [/\bSLC7A11\b/i, 'SLC7A11'],
  [/\bHIF-1(?:alpha|α)?\b/i, 'HIF-1'], [/\bAMPK\b/i, 'AMPK'], [/\bmiR-\d+[a-z]?\b/i, null],
  [/\bSIRT[1-7]\b/i, null], [/\bFOXO[1-4]?\b/i, null], [/\bBCL-2\b/i, 'BCL-2'],
  [/\bBAX\b/i, 'BAX'], [/\bPARP[12]?\b/i, null], [/\bTNF(?:-alpha)?\b/i, 'TNF'],
  [/\bIL-\d+\b/i, null], [/\bVEGF\b/i, 'VEGF'], [/\binterferon\b/i, '干扰素'],
  [/\binsulin\b/i, '胰岛素'], [/\bestrogen\b/i, '雌激素'], [/\bandrogen\b/i, '雄激素']
];

function extract(paper) {
  const title = clean(paper.title);
  const processes = processRules.filter(([pattern]) => pattern.test(title)).map(([, label]) => label);
  const contexts = contextRules.filter(([pattern]) => pattern.test(title)).map(([, label]) => label);
  if (contexts.some(label => /癌|瘤|白血病/.test(label) && label !== '肿瘤')) {
    const generic = contexts.indexOf('肿瘤');
    if (generic >= 0) contexts.splice(generic, 1);
  }
  const entities = entityRules.flatMap(([pattern, label]) => {
    const match = title.match(pattern);
    return match ? [label || match[0]] : [];
  });
  for (const name of title.match(/\b[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*\b/g) || []) {
    if ((/[0-9]/.test(name) || /^[A-Z]{3,8}$/.test(name)) && !/^(RNA|DNA|PCR|GWAS|SNPs?|TCGA|GEO|COVID-19|SARS-CoV-2|HIV|AIDS|RNA-Seq|RNA-seq)$/.test(name) && !entities.some(entity => entity.toLowerCase() === name.toLowerCase())) entities.push(name);
  }
  const context = contexts.slice(0, 2).join('与');
  const molecular = entities.slice(0, 3).join('、');
  const process = processes.slice(0, 2).join('与');
  let focus = [molecular, process].filter(Boolean).join('相关的');
  if (context && !(context === '肿瘤' && focus.startsWith('肿瘤'))) focus = focus ? context + '相关研究中的' + focus : context + '相关的生物学变化';
  if (!focus) focus = '“' + title + '”涉及的生物学问题';
  return { title, focus, processes, contexts, entities };
}

const questions = [
  ['作用机制', f => '我想了解' + f + '，背后的生物学机制是什么？'],
  ['调控关系', f => f + '是怎样被调控的？有哪些关键分子参与？'],
  ['因果证据', f => '关于' + f + '，目前有哪些因果证据，哪些还只是相关性？'],
  ['机制假设', f => '我想研究' + f + '，有哪些值得进一步探究的机制假设？'],
  ['上下游关系', f => f + '涉及哪些上下游调控关系？现有文献支持到什么程度？'],
  ['细胞情境', f => '为什么' + f + '在不同细胞类型或生理状态下可能表现不同？'],
  ['机制争议', f => '关于' + f + '，不同研究有哪些分歧，可能的解释是什么？'],
  ['关键环节', f => '我想弄清' + f + '，哪些环节可能是机制中的关键节点？'],
  ['时序关系', f => f + '随时间怎样变化？哪些变化可能是原因，哪些是后果？'],
  ['替代解释', f => '目前对' + f + '的解释有哪些？有没有其他可能的机制？'],
  ['背景依赖', f => f + '是否依赖细胞状态或生物学背景？有哪些文献依据？'],
  ['证据缺口', f => '关于' + f + '，哪些机制已有支持，哪些问题还没有解决？']
];
function sources(title) {
  const q = encodeURIComponent(title);
  return [
    ['PubMed', 'https://pubmed.ncbi.nlm.nih.gov/?term=' + q],
    ['Europe PMC', 'https://europepmc.org/search?query=' + q],
    ['PMC Open Access', 'https://pmc.ncbi.nlm.nih.gov/?term=' + q],
    ['Europe PMC OA API', 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=' + q + '%20AND%20OPEN_ACCESS:Y&format=json&pageSize=10'],
    ['OpenAlex OA', 'https://api.openalex.org/works?search=' + q + '&filter=open_access.is_oa:true&per-page=10'],
    ['Crossref', 'https://search.crossref.org/?q=' + q],
    ['Semantic Scholar', 'https://www.semanticscholar.org/search?q=' + q + '&sort=relevance'],
    ['bioRxiv PDF search', 'https://www.google.com/search?q=' + q + '+site%3Abiorxiv.org+filetype%3Apdf'],
    ['medRxiv PDF search', 'https://www.google.com/search?q=' + q + '+site%3Amedrxiv.org+filetype%3Apdf'],
    ['Google Scholar PDF search', 'https://scholar.google.com/scholar?q=' + q + '+filetype%3Apdf']
  ].map(([provider, url]) => ({ provider, url, access: '检索入口，全文可用性需核验' }));
}
const literature = fs.readFileSync(path.join(docs, 'bio-literature-topics-20000.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const candidates = literature.filter(p => mechanismPattern.test(clean(p.title)) && !excludedPattern.test(clean(p.title)));
if (candidates.length < COUNT) throw new Error('Insufficient mechanism titles: ' + candidates.length);
const usedQueries = new Set();
const records = candidates.slice(0, COUNT).map((paper, index) => {
  const e = extract(paper);
  let chosen = index % questions.length;
  let query = questions[chosen][1](e.focus);
  for (let attempt = 1; usedQueries.has(query) && attempt < questions.length; attempt++) {
    chosen = (index + attempt) % questions.length;
    query = questions[chosen][1](e.focus);
  }
  if (usedQueries.has(query)) query = '我在读“' + e.title + '”，' + query;
  if (usedQueries.has(query)) throw new Error('Duplicate query for ' + paper.id);
  usedQueries.add(query);
  return {
    id: 'BIOQ-' + String(index + 1).padStart(5, '0'), query,
    queryType: 'title-to-conversational-mechanism-query',
    generationSource: 'title-keyword-rules-v2', evidenceScope: 'title-only',
    sourceTitle: paper.title, literatureId: paper.id, topic: paper.category,
    researchFocus: e.focus, mechanismTopics: e.processes,
    researchContexts: e.contexts, molecularEntities: e.entities,
    intent: questions[chosen][0], searchQuery: e.title,
    source: paper.source, sourceId: paper.sourceId, pmid: paper.pmid,
    pmcid: paper.pmcid, doi: paper.doi, journal: paper.journal, year: paper.year,
    authors: paper.authors, sourceUrl: paper.sourceUrl, pdfUrl: paper.pdfUrl, sources: sources(e.title)
  };
});
const forbidden = /试剂|耗材|仪器|采购|货号|购买|材料清单|实验步骤|实验流程/;
if (records.some(r => forbidden.test(r.query))) throw new Error('Operational request in mechanism queries');
if (new Set(records.map(r => r.pmid)).size !== COUNT) throw new Error('Duplicate PMID');
fs.writeFileSync(path.join(docs, 'bio-research-query-catalog-10000.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
const lines = [
  '# 生物学机制口语化 Query 目录 10000 条', '',
  '更新：2026-10-09。以真实 PubMed/Europe PMC 文献标题为来源，生成研究机制的用户口语化问题。完整数据见 [JSONL](bio-research-query-catalog-10000.jsonl)。', '',
  '## 提问范围', '',
  '围绕信号调控、基因表达、免疫应答、细胞死亡、代谢、表观遗传、细胞分化、肿瘤转移和微生物群等主题，询问作用机制、上下游关系、因果证据、时序、细胞背景、替代解释与证据缺口。Query 不直接询问试剂、耗材、仪器、采购或实验操作步骤。', '',
  '## 标题到问题的转换', '',
  '1. 从 20,000 条文献目录筛选机制相关标题，排除统计、诊断、预后及临床试验类标题，取前 10,000 篇；新编号对应的文献可能与旧版不同，请用 PMID 或 literatureId 关联原文。',
  '2. 只根据标题实际出现的关键词识别分子、细胞过程和研究背景，形成 researchFocus。',
  '3. 把主题转换为口语化机制问题；相同主题尝试不同意图，仍重复时带入原始标题以保留文献特异性。',
  '4. 保留 sourceTitle 和 PMID/PMCID/DOI。外部检索入口使用英文标题 searchQuery，以便在文献数据库中检索。', '',
  '这是基于标题关键词的规则生成目录，尚未逐条人工复核。问题中的潜在关系是待检索假设，不代表论文已经证明的结论。缺少可识别中文主题时保留原始英文标题，不臆造疾病、分子关系或实验细节。', '',
  '## 数据字段', '',
  '| 字段 | 含义 |', '| --- | --- |',
  '| query / intent | 口语化机制问题及提问意图 |',
  '| sourceTitle / literatureId | 原始文献标题与文献目录 ID |',
  '| researchFocus | 从标题提取的主题 |',
  '| mechanismTopics / researchContexts / molecularEntities | 标题命中的过程、背景和分子标签，仅作检索提示 |',
  '| generationSource / evidenceScope | title-keyword-rules-v2 / title-only，说明生成与证据范围 |',
  '| searchQuery / sources | 英文标题检索表达与 10 个公开检索入口 |',
  '| pmid / pmcid / doi / sourceUrl | 文献追溯字段 |', '',
  '## 校验与复现', '',
  '校验 10,000 条记录、10,000 个唯一 Query 与 PMID，检查提问中没有材料或操作请求，并核对与原始文献的标题和 PMID 对应。生成命令：', '',
  '    node scripts/generate-bio-query-catalog.cjs', '',
  '## 示例', '',
  '| ID | 口语化机制问题 | 原始文献标题 | PMID |', '| --- | --- | --- | --- |',
  ...records.slice(0, 30).map(r => '| ' + r.id + ' | ' + r.query.replace(/\|/g, '\\|') + ' | ' + r.sourceTitle.replace(/\|/g, '\\|') + ' | [' + r.pmid + '](' + r.sourceUrl + ') |')
];
fs.writeFileSync(path.join(docs, 'bio-research-query-catalog-10000.md'), lines.join('\n') + '\n');
console.log(JSON.stringify({ candidates: candidates.length, records: records.length, uniqueQueries: usedQueries.size, examples: records.slice(0, 5).map(r => r.query) }, null, 2));
