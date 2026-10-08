const fs = require('node:fs');
const path = require('node:path');

const literaturePath = path.join(__dirname, '..', 'docs', 'bio-literature-topics-20000.jsonl');
const methodRules = [
  [/single[- ]cell\s*rna|scrna|single[- ]cell transcript/i, '单细胞 RNA 测序'], [/spatial transcript/i, '空间转录组'],
  [/single[- ]cell\s*atac|scatac|atac[- ]seq/i, '单细胞 ATAC 测序'], [/bulk\s*rna|rna[- ]seq|transcriptom/i, 'RNA 测序'],
  [/whole[- ]exome|exome sequencing/i, '外显子组测序'], [/whole[- ]genome|genome sequencing/i, '全基因组测序'],
  [/16s|microbiom|microbiota/i, '微生物组测序'], [/flow cytometr|fluorescence-activated|facs/i, '流式细胞术'],
  [/immunohistochem/i, '免疫组化染色'], [/immunofluorescen|immunofluorescence/i, '免疫荧光染色'],
  [/western blot|immunoblot/i, 'Western blot'], [/quantitative.*pcr|real-time.*pcr|\bqpcr\b/i, 'qPCR'],
  [/crispr|cas9|gene edit/i, 'CRISPR 基因编辑'], [/rna interference|\bsiRNA\b|knockdown/i, 'RNA 干扰'],
  [/proteom|mass spectrom|lc-ms|maldi/i, '蛋白质组学'], [/metabolom|metabolic profiling/i, '代谢组学'],
  [/organoid/i, '类器官培养'], [/stem cell|ips cell|pluripotent/i, '干细胞培养'],
  [/methylat|epigen/i, 'DNA 甲基化分析'], [/chip-seq|cut&tag|cut&run|chromatin/i, '染色质测序'],
  [/pcr|amplification/i, 'PCR 检测'], [/survival analysis|prognos|risk model/i, '生存和预后分析'],
  [/differential expression|gene expression/i, '基因表达分析'], [/machine learning|deep learning|prediction model/i, '预测模型分析']
];
const categoryLabels = { '单细胞与空间组学': '细胞和空间分布', '基因组与转录组': '基因和转录组变化', '肿瘤与疾病机制': '疾病机制和表型', '免疫与炎症': '免疫反应和炎症', '微生物组与感染': '微生物和感染', '神经科学': '神经系统变化', '干细胞与再生医学': '细胞分化和组织修复', '代谢与蛋白质组学': '蛋白质和代谢变化', '药物与治疗研究': '治疗效果和药物反应', '生物医学方法学': '实验方法和检测结果', '生物医学综合研究': '生物医学问题' };
const intentTemplates = [
  (subject, method) => `我想研究${subject}，应该怎么做${method}？`,
  (subject, method) => `我想分析${subject}，用${method}需要哪些实验步骤和关键参数？`,
  (subject, method) => `如果要检测${subject}，${method}的样本处理、试剂和质控怎么设计？`,
  (subject, method) => `我想复现这篇文献中关于${subject}的研究，${method}需要准备什么？`,
  (subject, method) => `针对${subject}，有哪些文献支持的${method}方案？`,
  (subject, method) => `我想验证${subject}的变化，${method}如何选择对照、样本量和分析方法？`,
  (subject, method) => `研究${subject}时，${method}有哪些常见失败原因和优化办法？`,
  (subject, method) => `我想从${subject}得到可靠结果，${method}对应哪些试剂、耗材和仪器？`
];
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function inferMethod(title, category) { return methodRules.find(([pattern]) => pattern.test(title))?.[1] || (category === '生物医学方法学' ? '实验方法分析' : '文献中的实验方法'); }
function subjectFrom(title, category) { const method = methodRules.find(([pattern]) => pattern.test(title))?.[1]; const compact = clean(title).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[,:;.!?]+/g, ' ').replace(/\s+/g, ' ').trim(); const subject = method ? compact.replace(new RegExp(method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim() : compact; return subject.length >= 8 && subject.length <= 80 ? subject : (categoryLabels[category] || '这个研究主题'); }
function makeQuery(record, index) { return intentTemplates[index % intentTemplates.length](subjectFrom(record.title, record.category), inferMethod(record.title, record.category)); }
function makeIntent(query) { if (/试剂|耗材|仪器/.test(query)) return '关键试剂与实验材料'; if (/失败|优化/.test(query)) return '关键参数优化与失败排查'; if (/复现|实验步骤/.test(query)) return '文献 Methods 复现'; if (/对照|样本量|分析方法/.test(query)) return '研究设计与数据分析'; return '实验方案检索'; }
function sourceLinks(query) { const encoded = encodeURIComponent(query); return [['PubMed', `https://pubmed.ncbi.nlm.nih.gov/?term=${encoded}`, '检索入口'], ['Europe PMC', `https://europepmc.org/search?query=${encoded}`, '检索入口'], ['PMC Open Access', `https://pmc.ncbi.nlm.nih.gov/?term=${encoded}`, '开放全文筛选'], ['Europe PMC OA API', `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encoded}%20AND%20OPEN_ACCESS:Y&format=json&pageSize=10`, '优先筛选开放全文'], ['OpenAlex OA', `https://api.openalex.org/works?search=${encoded}&filter=open_access.is_oa:true&per-page=10`, '优先筛选开放全文'], ['Crossref', `https://search.crossref.org/?q=${encoded}`, '检索入口'], ['Semantic Scholar', `https://www.semanticscholar.org/search?q=${encoded}&sort=relevance`, '检索入口'], ['bioRxiv PDF search', `https://www.google.com/search?q=${encoded}+site%3Abiorxiv.org+filetype%3Apdf`, '开放全文筛选'], ['medRxiv PDF search', `https://www.google.com/search?q=${encoded}+site%3Amedrxiv.org+filetype%3Apdf`, '开放全文筛选'], ['Google Scholar PDF search', `https://scholar.google.com/scholar?q=${encoded}+filetype%3Apdf`, '检索入口']].map(([provider, url, access]) => ({ provider, url, access })); }
const literature = fs.readFileSync(literaturePath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (literature.length < 10000) throw new Error(`Expected at least 10000 literature records, got ${literature.length}`);
const records = literature.slice(0, 10000).map((paper, index) => { const query = makeQuery(paper, index); return { id: `BIOQ-${String(index + 1).padStart(5, '0')}`, query, queryType: 'title-to-conversational-research-query', sourceTitle: paper.title, topic: paper.category, method: inferMethod(paper.title, paper.category), intent: makeIntent(query), source: 'Europe PMC / PubMed', sourceId: paper.sourceId, pmid: paper.pmid, pmcid: paper.pmcid, doi: paper.doi, journal: paper.journal, year: paper.year, authors: paper.authors, sourceUrl: paper.sourceUrl, pdfUrl: paper.pdfUrl, sources: sourceLinks(query) }; });
const jsonlPath = path.join(__dirname, '..', 'docs', 'bio-research-query-catalog-10000.jsonl');
fs.writeFileSync(jsonlPath, records.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
const lines = ['# 生物科研口语化 Query 目录 10000 条', '', '每条 query 由一篇真实 PubMed/Europe PMC 文献的 title 转换而来，保留原始标题、PMID/DOI 和来源链接，供 RAG 召回和证据追溯使用。', '', '> 说明：口语化 query 是检索表达，不等于文献结论或实验协议。具体 Methods、参数和因果关系必须回到原文核验。', '', '## 数据字段', '', '- `query`：面向科研用户的自然语言问题。', '- `sourceTitle`：生成该问题的原始文献标题。', '- `method`：从标题和主题推断的实验方法标签。', '- `intent`：实验方案、Methods 复现、试剂材料或设计分析意图。', '- `pmid` / `pmcid` / `doi`：文献证据标识。', '- `sources`：基于口语化 query 的检索入口。', '', '完整机器可读数据见 `bio-research-query-catalog-10000.jsonl`。以下为前 20 条示例：', '', '| ID | 口语化 Query | 原始文献标题 | PMID |', '| --- | --- | --- | --- |', ...records.slice(0, 20).map(item => `| ${item.id} | ${item.query} | ${item.sourceTitle.replace(/\|/g, '\\|')} | ${item.pmid || '-'} |`)];
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'bio-research-query-catalog-10000.md'), lines.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ records: records.length, first: records[0], last: records.at(-1) }, null, 2));

/*
/*
const topics = [
  '单细胞 RNA 测序', '空间转录组', '单细胞 ATAC 测序', '单细胞多组学', 'bulk RNA 测序', '转录组测序', '外显子组测序', '全基因组测序', '宏基因组测序', '宏转录组测序',
  '16S rRNA 测序', '微生物组分析', '肠道菌群', '肿瘤免疫微环境', '肿瘤浸润淋巴细胞', 'CAR-T 细胞', 'TCR 测序', 'BCR 测序', '免疫组库', '流式细胞术',
  '免疫荧光染色', '免疫组化染色', 'Western blot', 'ELISA', 'qPCR', '数字 PCR', 'RNA 原位杂交', 'RNAscope', 'ChIP-seq', 'CUT&Tag',
  'CUT&RUN', 'ATAC-seq', '甲基化测序', 'DNA 羟甲基化', 'Hi-C', '染色质构象', 'CRISPR 敲除', 'CRISPR 激活', 'CRISPRi', '碱基编辑',
  '先导编辑', 'RNA 干扰', 'siRNA 转染', '慢病毒转导', '腺相关病毒', '质粒转染', '蛋白纯化', '抗体纯化', '亲和层析', '质谱蛋白组学',
  '磷酸化蛋白组学', '代谢组学', '脂质组学', '靶向代谢组', '非靶向代谢组', 'MALDI-TOF', 'LC-MS', 'GC-MS', '流式分选', '磁珠分选',
  '原代细胞培养', '细胞系培养', '干细胞培养', '诱导多能干细胞', '类器官培养', '肿瘤类器官', '脑类器官', '肠道类器官', '肺类器官', '器官芯片',
  '组织解离', '冷冻切片', '石蜡切片', '细胞冻存', '细胞复苏', '细胞活率检测', '细胞增殖实验', '细胞凋亡检测', '细胞周期分析', '细胞迁移实验',
  '细胞侵袭实验', '克隆形成实验', '3D 细胞培养', '药物敏感性实验', '高内涵成像', '共聚焦显微镜', '活细胞成像', '超分辨显微镜', '电子显微镜', '光片显微镜',
  '斑马鱼模型', '小鼠肿瘤模型', '小鼠炎症模型', '小鼠神经退行性疾病模型', '小鼠代谢疾病模型', '大鼠心血管模型', '患者来源异种移植', '人源化小鼠', '临床样本质控', '生物样本库',
  '生存分析', '差异表达分析', '通路富集分析', '基因集富集分析', '单细胞聚类', '细胞类型注释', '轨迹推断', '细胞通讯分析', '空间邻域分析', '多组学整合'
];

const intents = [
  '实验流程与 protocol', '样本制备方法', '关键试剂与耗材', '关键参数优化', '质量控制指标', '常见失败原因', '数据预处理流程', '数据标准化方法', '差异分析方法', '批次效应校正',
  '统计分析方案', '结果可视化方法', '生物学重复设计', '技术重复设计', '阳性对照设置', '阴性对照设置', '阴性结果解释', '灵敏度评估', '特异性评估', '检测限评估',
  '实验成本估算', '样本量估算', '研究设计要点', '临床队列设计', '动物实验设计', '随机化与盲法', '伦理与合规要求', '方法学验证', '结果复现性', '开放获取文献',
  'marker 筛选', 'marker 验证', '抗体选择', '引物设计', '探针设计', '文库构建', '测序深度选择', '测序平台比较', '建库失败排查', '低质量数据处理',
  '细胞活率提升', '细胞回收率提升', 'RNA 完整性提升', 'DNA 质量控制', '去除环境 RNA', '去除双细胞', '去除批次效应', '去除低质量细胞', '去除污染信号', '去除背景荧光',
  '药物处理条件', '剂量反应曲线', '时间梯度设计', '浓度梯度设计', '机制验证实验', '救援实验设计', '过表达验证', '敲低效率验证', '敲除效率验证', '脱靶效应检测',
  '文献检索策略', 'PubMed 检索式', '开放全文筛选', 'PDF 下载入口', '高被引文献', '近五年研究进展', '经典方法论文', '方法学综述', '临床转化证据', '动物到人的证据',
  '软件工具比较', 'R 语言分析流程', 'Python 分析流程', '单细胞软件教程', '空间组学软件教程', '可复现分析环境', '容器化分析流程', '参考基因组选择', '注释数据库选择', '数据库版本差异',
  '实验室安全', '样本保存条件', '运输条件', '冻融次数控制', '生物安全等级', '实验记录模板', '原始数据归档', '代码与数据共享', '图表发表规范', '论文方法写作',
  '结果解读', '机制假设生成', '候选靶点排序', '候选药物筛选', '生物标志物发现', '预后模型构建', '诊断模型构建', '机器学习建模', '深度学习建模', '模型外部验证'
];

const providers = [
  ['PubMed', query => `https://pubmed.ncbi.nlm.nih.gov/?term=${query}`],
  ['Europe PMC', query => `https://europepmc.org/search?query=${query}`],
  ['PMC Open Access', query => `https://pmc.ncbi.nlm.nih.gov/?term=${query}`],
  ['Europe PMC OA API', query => `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}%20AND%20OPEN_ACCESS:Y&format=json&pageSize=10`],
  ['OpenAlex OA', query => `https://api.openalex.org/works?search=${query}&filter=open_access.is_oa:true&per-page=10`],
  ['Crossref', query => `https://search.crossref.org/?q=${query}`],
  ['Semantic Scholar', query => `https://www.semanticscholar.org/search?q=${query}&sort=relevance`],
  ['bioRxiv PDF search', query => `https://www.google.com/search?q=${query}+site%3Abiorxiv.org+filetype%3Apdf`],
  ['medRxiv PDF search', query => `https://www.google.com/search?q=${query}+site%3Amedrxiv.org+filetype%3Apdf`],
  ['Google Scholar PDF search', query => `https://scholar.google.com/scholar?q=${query}+filetype%3Apdf`
  ]
];

const outputDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(outputDir, { recursive: true });
const records = [];
for (let index = 0; index < 10000; index += 1) {
  const topic = topics[index % topics.length];
  const intent = intents[Math.floor(index / topics.length) % intents.length];
  const query = `${topic} ${intent}`;
  const encoded = encodeURIComponent(query);
  records.push({
    id: `BIOQ-${String(index + 1).padStart(5, '0')}`,
    query,
    topic,
    intent,
    sources: providers.map(([provider, build]) => ({ provider, url: build(encoded), access: provider.includes('OA') || provider.includes('PDF') ? '优先筛选开放全文或 PDF' : '检索入口' }))
  });
}

const jsonlPath = path.join(outputDir, 'bio-research-query-catalog-10000.jsonl');
fs.writeFileSync(jsonlPath, records.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
const lines = [
  '# 生物科研常规 Query 目录 10000 条',
  '',
  '该目录用于 ScienceHelper 的科研检索与文献入口预置。每条 query 提供 10 个公开检索或开放全文筛选入口，优先定位 PubMed、PMC、Europe PMC、OpenAlex 等可追溯来源。',
  '',
  '> 重要说明：目录中的链接是文献检索/开放全文筛选入口，不承诺每个 query 都有 10 篇合法开放获取 PDF。最终是否可下载由数据库返回结果、版权和开放获取状态决定；平台应在展示直链前校验 `is_oa`、PMCID 或出版社授权。',
  '',
  '## 数据字段',
  '',
  '- `id`：稳定的 query 编号。',
  '- `query`：中文主题与研究任务组合。',
  '- `topic`：生物科研主题。',
  '- `intent`：用户常见检索意图。',
  '- `sources`：10 个来源入口，含来源、URL 和访问说明。',
  '',
  '完整机器可读数据见同目录下的 `bio-research-query-catalog-10000.jsonl`。以下为前 20 条示例：',
  '',
  '| ID | Query | 文献入口 |',
  '| --- | --- | --- |',
  ...records.slice(0, 20).map(item => `| ${item.id} | ${item.query} | ${item.sources.map(source => `[${source.provider}](${source.url})`).join(' · ')} |`)
];
fs.writeFileSync(path.join(outputDir, 'bio-research-query-catalog-10000.md'), lines.join('\n') + '\n', 'utf8');
console.log(`Generated ${records.length} query records.`);
*/
