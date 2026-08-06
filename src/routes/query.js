const express = require('express');
const router = express.Router();
const { embed } = require('../embedder');
const { searchDense, searchSparse } = require('../vectorStore');
const { chat } = require('../llm');
const { buildVocabulary, computeSparseVector } = require('../bm25');
const { rerank } = require('../reranker');
const { reciprocalRankFusion } = require('../rrf');

router.post('/', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question must be a non-empty string' });

    const trimmed = question.trim();
    if (trimmed.length < 3) return res.status(400).json({ error: 'question must be at least 3 characters' });
    if (trimmed.length > 1000) return res.status(400).json({ error: 'question too long — max 1000 characters' });

    // Step 1 — Dense semantic search
    const { hydeEmbed } = require('../hyde');
    const queryVec = await hydeEmbed(trimmed);
    const denseResults = await searchDense(queryVec, 10);

    // Step 2 — Sparse BM25 search
    const queryVocab = buildVocabulary([trimmed]);
    const sparseVec = computeSparseVector(trimmed, queryVocab);
    const sparseResults = await searchSparse(sparseVec, 10);

  //Step 3 — RRF fusion instead of raw score merge
const candidates = reciprocalRankFusion([denseResults, sparseResults])
  .slice(0, 10);

    // Step 4 — Rerank candidates with Cohere cross-encoder
    const reranked = await rerank(trimmed, candidates, 4);

    // Step 5 — Deduplicate by parentIndex
    const seenParents = new Map();
    for (const result of reranked) {
      const pIdx = result.payload.parentIndex ?? result.payload.chunkIndex;
      if (!seenParents.has(pIdx) || result.rerankScore > seenParents.get(pIdx).rerankScore) {
        seenParents.set(pIdx, result);
      }
    }
    const dedupedResults = Array.from(seenParents.values());

    // Step 6 — Build context from unique parents and generate answer
    const context = dedupedResults
      .map(r => r.payload.parentText || r.payload.text)
      .join('\n\n');

    const answer = await chat([
      { role: 'system', content: 'You are a helpful assistant. Answer the question using only the provided context. If the answer is not in the context, say you do not know.' },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${trimmed}` }
    ]);

    return res.status(200).json({
      answer,
      retrieved: dedupedResults.length,
      sources: dedupedResults.map(r => ({
        childText: r.payload.text,
        parentText: r.payload.parentText?.slice(0, 200) ?? null,
        rerankScore: parseFloat(r.rerankScore?.toFixed(4) ?? 0),
        parentIndex: r.payload.parentIndex ?? null,
        source: r.payload.source ?? null
      }))
    });

  } catch (err) {
    console.error('[query error]', err.message);
    return res.status(500).json({ error: 'Internal server error. Check server logs.' });
  }
});

module.exports = router;