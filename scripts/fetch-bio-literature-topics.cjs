const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_QUERY = [
  'SRC:MED',
  'FIRST_PDATE:[2000-01-01 TO 2026-12-31]',
  '(TITLE:cell OR TITLE:gene OR TITLE:protein OR TITLE:RNA OR TITLE:DNA OR TITLE:immune OR TITLE:cancer OR TITLE:microbiome OR TITLE:metabolism OR TITLE:genome OR TITLE:transcriptome OR TITLE:organoid OR TITLE:CRISPR OR TITLE:enzyme OR TITLE:virus OR TITLE:tumor OR TITLE:neuron OR TITLE:microRNA OR TITLE:stem-cell)'
].join(' AND ');

const TOPIC_RULES = [
  ['单细胞与空间组学', /single[- ]cell|single-cell|spatial transcript|scRNA|scATAC|cell atlas|cellular heterogeneity/i],
  ['基因组与转录组', /genome|genomic|transcriptom|sequenc|exome|methylat|epigen|chromatin|RNA-seq|DNA-seq/i],
  ['肿瘤与疾病机制', /cancer|carcinoma|tumou?r|leukemia|lymphoma|metast|oncolog|disease mechanism/i],
  ['免疫与炎症', /immune|immun|inflamm|cytokine|macrophage|lymphocyte|T cell|B cell|antibody/i],
  ['微生物组与感染', /microbiom|microbiota|bacter|virus|viral|fung|pathogen|infection|parasite/i],
  ['神经科学', /neuron|neural|brain|cerebr|synap|Alzheimer|Parkinson|neurodegener/i],
  ['干细胞与再生医学', /stem cell|organoid|regenerat|differentiation|iPSC|pluripotent/i],
  ['代谢与蛋白质组学', /metabol|proteom|lipid|phosphorylat|mass spectrom|enzyme|metabolic/i],
  ['药物与治疗研究', /drug|therap|inhibitor|treatment|clinical trial|pharmac|vaccine|diagnos/i],
  ['生物医学方法学', /assay|protocol|method|biomarker|model|validation|analysis|prediction|diagnostic/i]
];

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (!value.startsWith('--')) return pairs;
  const key = value.slice(2);
  const next = values[index + 1];
  pairs.push([key, next && !next.startsWith('--') ? next : true]);
  return pairs;
}, []));
const count = Math.max(1, Math.min(100000, Number(args.count || 20000)));
const pageSize = Math.max(100, Math.min(1000, Number(args.pageSize || 1000)));
const outputPath = args.output || path.join(__dirname, '..', 'docs', `bio-literature-topics-${count}.jsonl`);
const query = args.query || DEFAULT_QUERY;
const endpoint = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function classify(title) {
  return TOPIC_RULES.find(([, pattern]) => pattern.test(title))?.[0] || '生物医学综合研究';
}
function makeDescription(title, category) {
  return `围绕“${title}”开展${category}研究，重点梳理研究对象、关键分子或细胞过程、样本与模型、干预因素及评价指标，并据此设计可复现的实验和数据分析方案。该描述由文献标题模板生成，具体结论、参数和因果关系需回到原文核验。`;
}
function makeQuery(title) {
  return `${title} 实验方法 关键机制 样本 模型 结果评价`;
}
async function fetchPage(cursorMark, attempt = 0) {
  const params = new URLSearchParams({ query, format: 'json', resultType: 'core', pageSize: String(pageSize), sort: 'CITED desc' });
  if (cursorMark) params.set('cursorMark', cursorMark);
  let response;
  try {
    response = await fetch(`${endpoint}?${params.toString()}`, { headers: { Accept: 'application/json', 'User-Agent': 'ScienceHelper-bio-literature-topics/1.0' } });
  } catch (error) {
    if (attempt < 5) {
      await sleep(1000 * (attempt + 1));
      return fetchPage(cursorMark, attempt + 1);
    }
    throw error;
  }
  if (!response.ok) {
    if (attempt < 5 && [429, 500, 502, 503, 504].includes(response.status)) {
      await sleep(1000 * (attempt + 1));
      return fetchPage(cursorMark, attempt + 1);
    }
    throw new Error(`Europe PMC returned ${response.status}`);
  }
  return response.json();
}
function normalize(item, index) {
  const title = clean(item.title);
  const category = classify(title);
  const pmid = clean(item.pmid);
  const pmcid = clean(item.pmcid);
  const doi = clean(item.doi);
  const sourceUrl = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : (pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : `https://europepmc.org/article/${clean(item.source || 'MED')}/${clean(item.id)}`);
  const pdfUrl = item.fullTextUrlList?.fullTextUrl?.find(link => String(link.documentStyle || '').toLowerCase() === 'pdf')?.url || (pmcid ? `https://europepmc.org/articles/${pmcid}?pdf=render` : '');
  return {
    id: `BIOT-${String(index + 1).padStart(5, '0')}`,
    title,
    topicDescription: makeDescription(title, category),
    query: makeQuery(title),
    category,
    source: 'Europe PMC / PubMed',
    sourceId: clean(item.id),
    pmid,
    pmcid,
    doi,
    journal: clean(item.journalInfo?.journal?.title || item.bookOrReportDetails?.publisher),
    year: clean(item.pubYear || item.firstPublicationDate).slice(0, 4),
    authors: clean(item.authorString),
    citedByCount: Number(item.citedByCount || 0),
    isOpenAccess: item.isOpenAccess === true || String(item.isOpenAccess || '').toUpperCase() === 'Y',
    sourceUrl,
    pdfUrl,
    descriptionSource: 'template-v1-title-to-topic'
  };
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const seen = new Set(); const records = []; let cursor = ''; let pages = 0;
  while (records.length < count) {
    const payload = await fetchPage(cursor); pages += 1;
    const batch = payload.resultList?.result || [];
    if (!batch.length) break;
    for (const item of batch) {
      const title = clean(item.title); const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key); records.push(normalize(item, records.length));
      if (records.length >= count) break;
    }
    const next = payload.nextCursorMark || '';
    if (!next || next === cursor || batch.length < pageSize) break;
    cursor = next;
    console.log(`Fetched page ${pages}; ${records.length}/${count} unique titles`);
    await sleep(250);
  }
  fs.writeFileSync(outputPath, records.map(record => JSON.stringify(record)).join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({ outputPath, requested: count, written: records.length, pages, query }, null, 2));
  if (records.length < count) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exit(1); });
