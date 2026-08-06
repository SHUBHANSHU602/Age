const express = require('express');
const router = express.Router();
const { embed } = require('../embedder');
const { searchDense, searchSparse } = require('../vectorStore');
const { buildVocabulary, computeSparseVector } = require('../bm25');
const { reciprocalRankFusion } = require('../rrf');
const { rerank } = require('../reranker');
const { retrieve } = require('../retrieval');

const TEST_QUESTIONS = [
  'What is array rotation?',
  'How does the reversal algorithm work?',
  'What is the time complexity of the best approach?',
  'explain shifting',
  'What is machine learning?'
];

// Runs each test question through three strategies and returns
// structured comparison data. Used to demonstrate retrieval improvement
// in interviews and to catch regressions when changing retrieval config.
router.get('/', async (req, res) => {
  try {
    const results = [];

    for (const question of TEST_QUESTIONS) {
      const row = { question, strategies: {} };

      // Strategy 1 — Naive dense only
      const queryVec = await embed(question);
      const denseOnly = await searchDense(queryVec, 5);
      row.strategies.naive = {
        top1Score: parseFloat((denseOnly[0]?.score ?? 0).toFixed(4)),
        top1Preview: denseOnly[0]?.payload?.text?.slice(0, 80) ?? null
      };

      // Strategy 2 — Hybrid RRF
      const queryVocab = buildVocabulary([question]);
      const sparseVec = computeSparseVector(question, queryVocab);
      const sparseResults = await searchSparse(sparseVec, 5);
      const hybrid = reciprocalRankFusion([denseOnly, sparseResults]);
      row.strategies.hybrid = {
        top1RRFScore: parseFloat((hybrid[0]?.rrfScore ?? 0).toFixed(4)),
        top1Preview: hybrid[0]?.payload?.text?.slice(0, 80) ?? null
      };

      // Strategy 3 — Full pipeline (hybrid + rerank)
      const full = await retrieve(question, { useMultiQuery: false, useRerank: true, topN: 3 });
      row.strategies.full = {
        top1RerankScore: parseFloat((full[0]?.rerankScore ?? 0).toFixed(4)),
        top1Preview: full[0]?.payload?.text?.slice(0, 80) ?? null
      };

      results.push(row);
    }

    res.json({ status: 'ok', benchmark: results });

  } catch (err) {
    console.error('[benchmark error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;