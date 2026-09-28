'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRagIndex, rankReagents, retrieveRagEvidence, validationInfo } = require('../src/reagent-matching.cjs');

const rag = buildRagIndex([
  { id: 'sc-1', title: 'Single-cell RNA sequencing workflow', topicDescription: '单细胞 RNA 提取、建库与质量控制', category: '转录组学', query: 'single cell RNA library preparation', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/' },
  { id: 'qpcr-1', title: 'Evaluation of a quantitative PCR assay', topicDescription: '使用逆转录和 qPCR 评价基因表达', category: '分子检测', query: 'reverse transcription qPCR validation', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/2/' }
]);

test('retrieves RAG evidence for single-cell RNA topics', () => {
  const evidence = retrieveRagEvidence('肺组织单细胞 RNA 建库', rag, 3);
  assert.equal(evidence[0].id, 'sc-1');
  assert.match(evidence[0].sourceUrl, /pubmed/);
});

test('routes qPCR topics to qPCR products', () => {
  const rows = rankReagents('基因表达逆转录 qPCR', [
    { id: 'qpcr', name: 'TB Green Premix', category: 'qPCR', tags: ['SYBR'], stock: 4, rating: 4.8 },
    { id: 'rna', name: 'RNA extraction kit', category: 'RNA 提取', tags: ['RNA'], stock: 10, rating: 4.9 }
  ], rag, 2);
  assert.equal(rows[0].item.id, 'qpcr');
  assert.ok(rows[0].evidence.length > 0);
  assert.equal(rows[0].source, 'docs/bio-literature-topics-20000.jsonl');
});

test('validated product is ordered before an unvalidated candidate', () => {
  const rows = rankReagents('单细胞 RNA 提取', [
    { id: 'candidate', name: 'RNA extraction kit', category: 'RNA 提取', tags: ['RNA'], stock: 100, rating: 5 },
    { id: 'verified', name: 'RNeasy Plus Mini Kit', category: 'RNA 提取', tags: ['RNA-seq'], stock: 2, rating: 4.2, validationStatus: 'validated', qualityScore: 91, successRate: 0.94, evidenceCount: 8, reviewCount: 12 }
  ], rag, 2);
  assert.equal(rows[0].item.id, 'verified');
  assert.equal(rows[0].tier, 'validated_best');
});

test('a verified flag without measurable evidence cannot claim best', () => {
  const info = validationInfo({ validationStatus: 'verified', qualityScore: 95 });
  assert.equal(info.explicit, false);
  const rows = rankReagents('单细胞 RNA 提取', [{ id: 'r1', name: 'RNA kit', category: 'RNA 提取', stock: 1, validationStatus: 'verified', qualityScore: 95 }], rag, 1);
  assert.notEqual(rows[0].tier, 'validated_best');
});

test('out-of-stock products receive a lower score than the same in-stock product', () => {
  const rows = rankReagents('qPCR', [
    { id: 'out', name: 'qPCR kit', category: 'qPCR', stock: 0, rating: 5 },
    { id: 'in', name: 'qPCR kit', category: 'qPCR', stock: 2, rating: 5 }
  ], rag, 2);
  assert.ok(rows.find(row => row.item.id === 'in').score > rows.find(row => row.item.id === 'out').score);
});
