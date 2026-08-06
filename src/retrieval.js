const { embed } = require('./embedder');
const { searchDense, searchSparse } = require('./vectorStore');
const { buildVocabulary, computeSparseVector } = require('./bm25');
const { reciprocalRankFusion } = require('./rrf');
const { rerank } = require('./reranker');
const { multiQueryRetrieve } = require('./multiQuery');

// Single entry point for all retrieval strategies.
// Runs multi-query HyDE dense retrieval + BM25 sparse retrieval,
// fuses with RRF, reranks with Cohere, deduplicates by parentIndex.
// Returns final ranked list of unique parent contexts ready for LLM.
async function retrieve(question, options = {}) {
  const {
    useMultiQuery = true,
    useRerank = true,
    topK = 10,
    topN = 4
  } = options;

  // Dense retrieval — multi-query HyDE or single embed
  const denseResults = useMultiQuery
    ? await multiQueryRetrieve(question, 3, topK)
    : await searchDense(await embed(question), topK);

  // Sparse BM25 retrieval on original question
  const queryVocab = buildVocabulary([question]);
  const sparseVec = computeSparseVector(question, queryVocab);
  const sparseResults = await searchSparse(sparseVec, topK);

  // RRF fusion
  let candidates = reciprocalRankFusion([denseResults, sparseResults])
    .slice(0, topK);

  // Cohere reranking
  if (useRerank && candidates.length > 0) {
    candidates = await rerank(question, candidates, topN);
  }

  // Deduplicate by parentIndex — keep highest scoring child per parent
  const seenParents = new Map();
  for (const result of candidates) {
    const pIdx = result.payload.parentIndex ?? result.payload.chunkIndex;
    const score = result.rerankScore ?? result.rrfScore ?? result.score ?? 0;
    if (!seenParents.has(pIdx) || score > (seenParents.get(pIdx)._score || 0)) {
      seenParents.set(pIdx, { ...result, _score: score });
    }
  }

  return Array.from(seenParents.values());
}

module.exports = { retrieve };