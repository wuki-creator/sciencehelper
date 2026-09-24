const fs = require('node:fs');
const path = require('node:path');

const inputPath = process.argv[2] || path.join(__dirname, '..', 'docs', 'bio-research-query-catalog-10000.jsonl');
const outputPath = process.argv[3] || path.join(__dirname, '..', 'docs', 'bio-research-query-catalog-10000-with-pdfs.jsonl');
const limit = Math.max(1, Math.min(10, Number(process.env.PDF_LIMIT || 10)));
const rows = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function resolveRecord(record) {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(record.query)}%20AND%20OPEN_ACCESS:Y&format=json&pageSize=${limit}&resultType=core`;
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ScienceHelper-open-access-resolver/1.0' } });
  if (!response.ok) throw new Error(`Europe PMC returned ${response.status}`);
  const payload = await response.json();
  const papers = (payload.resultList?.result || []).slice(0, limit).map(item => {
    const pmcid = item.pmcid || '';
    const links = item.fullTextUrlList?.fullTextUrl || [];
    const pdf = links.find(link => String(link.documentStyle || '').toLowerCase() === 'pdf')?.url || (pmcid ? `https://europepmc.org/articles/${pmcid}?pdf=render` : '');
    return { title: item.title || '', pmid: item.pmid || '', pmcid, year: item.pubYear || '', pdfUrl: pdf, source: 'Europe PMC OA' };
  }).filter(item => item.pdfUrl);
  return { ...record, pdfs: papers, pdfResolution: { status: papers.length >= limit ? 'resolved' : 'partial', provider: 'Europe PMC', resolvedAt: new Date().toISOString() } };
}

async function main() {
  const output = [];
  for (let index = 0; index < rows.length; index += 1) {
    const record = rows[index];
    try { output.push(await resolveRecord(record)); }
    catch (error) { output.push({ ...record, pdfs: [], pdfResolution: { status: 'error', provider: 'Europe PMC', error: error.message } }); }
    if ((index + 1) % 10 === 0) console.log(`Resolved ${index + 1}/${rows.length}`);
    await sleep(120);
  }
  fs.writeFileSync(outputPath, output.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  console.log(`Wrote ${output.length} records to ${outputPath}`);
}
main().catch(error => { console.error(error); process.exit(1); });
