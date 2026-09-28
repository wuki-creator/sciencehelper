'use strict';

const fs = require('node:fs');

const RAG_SOURCE = 'docs/bio-literature-topics-20000.jsonl';
const STOP_WORDS = new Set(['的', '和', '与', '及', '中', '对', '进行', '研究', '分析', '方法', '实验', 'data', 'study', 'using', 'the', 'and', 'for']);
const REAGENT_HINTS = [
  { label: 'RNA 提取', pattern: /rna|转录组|单细胞|空间转录组|rnase|dnase|核酸/i },
  { label: '逆转录', pattern: /逆转录|cdna|first.?strand|reverse.?transcript/i },
  { label: 'qPCR', pattern: /qpcr|pcr|定量.?pcr|real.?time/i },
  { label: '建库', pattern: /建库|文库|library|测序|rna.?seq|atac.?seq|空间组学/i },
  { label: '样本处理', pattern: /样本|组织|细胞|培养|消化|裂解|胶原|trypsin|pbs|类器官/i },
  { label: '蛋白与免疫', pattern: /蛋白|抗体|免疫|western|elisa|流式|免疫荧光/i },
  { label: '质控', pattern: /质控|质量|完整性|批次|重复|validation|验证|灵敏度|特异性/i }
];

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokens(value) {
  const text = normalize(value);
  const result = [];
  for (const segment of text.match(/[a-z0-9][a-z0-9._-]*|[\u3400-\u9fff]+/gi) || []) {
    if (/^[\u3400-\u9fff]+$/.test(segment)) {
      if (segment.length <= 4 && !STOP_WORDS.has(segment)) result.push(segment);
      for (let index = 0; index < segment.length - 1; index += 1) {
        const bigram = segment.slice(index, index + 2);
        if (!STOP_WORDS.has(bigram)) result.push(bigram);
      }
    } else if (segment.length > 1 && !STOP_WORDS.has(segment)) result.push(segment);
  }
  return [...new Set(result)];
}

function readRagJsonl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const rows = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object') rows.push(row);
    } catch {
      // Ignore a malformed corpus row; one bad record must not disable matching.
    }
  }
  return rows;
}

function buildRagIndex(rows) {
  return (rows || []).map(row => {
    const fields = {
      title: String(row.title || ''),
      topic: String(row.topic || row.topicDescription || ''),
      category: String(row.category || ''),
      intent: String(row.intent || ''),
      query: String(row.query || ''),
      description: String(row.topicDescription || row.description || '')
    };
    return { row, fields, fieldTokens: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, new Set(tokens(value))])) };
  });
}

function retrieveRagEvidence(query, index, limit = 8) {
  const queryText = normalize(query);
  // Long Methods contexts can contain thousands of tokens. The leading
  // tokens contain the resource, role and topic; cap the query to keep the
  // 20k-row scan bounded while retaining deterministic ordering.
  const queryTokens = new Set(tokens(queryText).slice(0, 320));
  if (!queryTokens.size || !index?.length) return [];
  const weights = { title: 5, topic: 5, category: 3, intent: 2, query: 2, description: 1 };
  return index.map(entry => {
    let score = 0;
    for (const [field, weight] of Object.entries(weights)) {
      let hits = 0;
      for (const token of queryTokens) if (entry.fieldTokens[field].has(token)) hits += 1;
      score += Math.min(hits, 8) * weight;
    }
    const phrase = normalize(entry.fields.topic);
    if (phrase && queryText.includes(phrase)) score += 12;
    return { entry, score };
  }).filter(item => item.score > 0).sort((left, right) => right.score - left.score || String(left.entry.row.id).localeCompare(String(right.entry.row.id))).slice(0, limit).map(({ entry, score }) => ({
    id: entry.row.id,
    title: entry.fields.title,
    topic: entry.fields.topic,
    category: entry.fields.category,
    intent: entry.fields.intent,
    sourceId: entry.row.sourceId || entry.row.pmid || '',
    pmid: entry.row.pmid || '',
    doi: entry.row.doi || '',
    year: entry.row.year || '',
    sourceUrl: entry.row.sourceUrl || '',
    score
  }));
}

function validationInfo(item) {
  const value = item.validation && typeof item.validation === 'object' ? item.validation : {};
  const numericOrNaN = raw => raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
  const rawStatus = String(item.validationStatus || value.status || '').toLowerCase();
  const status = ['validated', 'verified', 'reviewed'].includes(rawStatus) || item.validated === true || item.verified === true ? 'validated' : 'candidate';
  const qualityScore = numericOrNaN(item.qualityScore ?? value.qualityScore ?? item.validationScore ?? value.score);
  const reviewCount = Number(item.reviewCount ?? value.reviewCount ?? 0);
  const evidenceCount = Number(item.evidenceCount ?? value.evidenceCount ?? 0);
  const successRateRaw = numericOrNaN(item.successRate ?? value.successRate);
  const successRate = Number.isFinite(successRateRaw) ? (successRateRaw > 1 ? successRateRaw / 100 : successRateRaw) : 0;
  const quality = Number.isFinite(qualityScore) ? Math.max(0, Math.min(100, qualityScore)) / 100 : 0;
  const success = Math.max(0, Math.min(1, successRate));
  const evidence = Math.min(1, Math.log1p(Math.max(0, evidenceCount)) / Math.log(11));
  const review = Math.min(1, Math.log1p(Math.max(0, reviewCount)) / Math.log(21));
  // A validation badge is a platform claim. Require all three measurable
  // signals so a free-text "verified" flag cannot be mistaken for evidence.
  const explicit = status === 'validated' && Number.isFinite(qualityScore) && Number.isFinite(successRateRaw) && evidenceCount > 0;
  return { status, explicit, qualityScore: Number.isFinite(qualityScore) ? qualityScore : null, reviewCount, evidenceCount, successRate: Number.isFinite(successRateRaw) ? successRate : null, score: explicit ? (0.45 * quality + 0.3 * success + 0.15 * evidence + 0.1 * review) : 0 };
}

function hintLabels(text) {
  return REAGENT_HINTS.filter(item => item.pattern.test(String(text || ''))).map(item => item.label);
}

function rankReagents(query, items, ragIndex, limit = 5, evidenceOverride = null) {
  const queryText = String(query || '');
  const queryTokenSet = new Set(tokens(queryText).slice(0, 320));
  const evidence = evidenceOverride || retrieveRagEvidence(queryText, ragIndex, 8);
  const ragLabels = new Set(evidence.flatMap(item => hintLabels(`${item.title} ${item.topic} ${item.category} ${item.intent}`)));
  const maxEvidenceScore = evidence[0]?.score || 1;
  return (items || []).filter(item => item && item.status !== 'inactive').map(item => {
    const productText = `${item.name || ''} ${item.brand || ''} ${item.category || ''} ${item.spec || ''} ${(item.tags || []).join(' ')}`;
    const productTokens = new Set(tokens(productText));
    const lexicalHits = [...queryTokenSet].filter(token => productTokens.has(token)).length;
    const lexical = queryTokenSet.size ? Math.min(1, lexicalHits / Math.min(queryTokenSet.size, 6)) : 0;
    const productLabels = hintLabels(productText);
    const aligned = productLabels.filter(label => ragLabels.has(label)).length;
    const ragSupport = ragLabels.size ? Math.min(1, aligned / Math.min(ragLabels.size, 3)) : 0;
    const validation = validationInfo(item);
    const availability = Number(item.stock) > 0 ? 1 : 0;
    const rating = Math.max(0, Math.min(1, Number(item.rating || 0) / 5));
    const score = 100 * (0.35 * lexical + 0.3 * ragSupport + 0.25 * validation.score + 0.05 * availability + 0.05 * rating);
    const matchedEvidence = evidence.filter(row => hintLabels(`${row.title} ${row.topic} ${row.category} ${row.intent}`).some(label => productLabels.includes(label))).slice(0, 3);
    const tier = validation.explicit && validation.qualityScore >= 80 && validation.successRate >= 0.8 && validation.evidenceCount >= 3 ? 'validated_best' : matchedEvidence.length ? 'evidence_supported' : 'candidate';
    const reason = validation.explicit
      ? `平台验证 ${validation.qualityScore ?? '—'} 分 · ${validation.evidenceCount || 0} 条验证证据${matchedEvidence.length ? `；RAG 支持 ${matchedEvidence.length} 条` : ''}`
      : matchedEvidence.length
        ? `RAG 召回 ${matchedEvidence.length} 条相关文献主题，${productLabels.join('、') || item.category || '商品'}与课题相符；尚无平台验证记录`
        : `与课题词项匹配 ${lexicalHits} 项；尚无平台验证记录`;
    return {
      item,
      score: Number(score.toFixed(2)),
      matchScore: Number(score.toFixed(2)),
      tier,
      reason,
      evidence: matchedEvidence,
      platformValidation: validation,
      ragSupport: Number(ragSupport.toFixed(3)),
      lexicalSupport: Number(lexical.toFixed(3)),
      source: RAG_SOURCE,
      maxEvidenceScore
    };
  }).sort((left, right) =>
    (right.tier === 'validated_best') - (left.tier === 'validated_best') ||
    right.score - left.score ||
    Number(right.item.rating || 0) - Number(left.item.rating || 0) ||
    String(left.item.id || left.item.name).localeCompare(String(right.item.id || right.item.name))
  ).slice(0, limit);
}

module.exports = { RAG_SOURCE, buildRagIndex, readRagJsonl, retrieveRagEvidence, rankReagents, validationInfo };
