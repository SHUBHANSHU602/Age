require('dotenv').config();
const { embed } = require('./embedder');
const { searchDense, searchSparse } = require('./vectorStore');
const { buildVocabulary, computeSparseVector } = require('./bm25');
const { reciprocalRankFusion } = require('./rrf');
const { rerank } = require('./reranker');

const questions = [
  'What is array rotation?',
  'How does the reversal algorithm work?',
  'What is the time complexity of the best approach?',
  'explain shifting',
  'What is machine learning?'
];

async function runBenchmark() {
  console.log('\n=== RETRIEVAL BENCHMARK ===\n');

  for (const question of questions) {
    console.log(`\nQ: "${question}"`);
    console.log('─'.repeat(60));

    const queryVec = await embed(question);

    // Strategy 1 — Naive dense only
    const denseResults = await searchDense(queryVec, 5);
    const top1Dense = denseResults[0];
    console.log(`[NAIVE]   score=${top1Dense?.score?.toFixed(4)} | ${top1Dense?.payload?.text?.slice(0, 60)}`);

    // Strategy 2 — Hybrid RRF
    const queryVocab = buildVocabulary([question]);
    const sparseVec = computeSparseVector(question, queryVocab);
    const sparseResults = await searchSparse(sparseVec, 5);
    const hybridResults = reciprocalRankFusion([denseResults, sparseResults]);
    const top1Hybrid = hybridResults[0];
    console.log(`[HYBRID]  rrfScore=${top1Hybrid?.rrfScore?.toFixed(4)} | ${top1Hybrid?.payload?.text?.slice(0, 60)}`);

    // Strategy 3 — Hybrid + Rerank
    const reranked = await rerank(question, hybridResults.slice(0, 8), 3);
    const top1Reranked = reranked[0];
    console.log(`[RERANK]  rerankScore=${top1Reranked?.rerankScore?.toFixed(4)} | ${top1Reranked?.payload?.text?.slice(0, 60)}`);
  }

  console.log('\n=== BENCHMARK COMPLETE ===\n');
  process.exit(0);
}

runBenchmark().catch(console.error);