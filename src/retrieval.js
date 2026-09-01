const { embed } = require('./embedder');
const { searchDense, searchSparse } = require('./vectorStore');
const { computeSparseVector } = require('./bm25');
const { reciprocalRankFusion } = require('./rrf');
const { rerank } = require('./reranker');
const { multiQueryRetrieve } = require('./multiQuery');

// Single entry point for all retrieval strategies.
// Runs multi-query HyDE dense retrieval + sparse lexical retrieval,
// fuses with RRF, reranks with Cohere, deduplicates by document+parent.
// Returns final ranked list of unique parent contexts.
async function retrieve(question, options = {}) {
  const {
    useMultiQuery = true,
    useRerank = true,
    topK = 10,
    topN = 4
  } = options;

  // Dense retrieval — multi-query HyDE or single raw-query embedding.
  const denseResults = useMultiQuery
    ? await multiQueryRetrieve(question, 3, topK)
    : await searchDense(await embed(question), topK);

  // Sparse lexical retrieval on the original question.
  // token hashing guarantees the same term maps to the same sparse index
  // as it did during ingestion.
  const sparseVec = computeSparseVector(question);
  const sparseResults = sparseVec.indices.length > 0
    ? await searchSparse(sparseVec, topK)
    : [];

  // RRF fusion.
  let candidates = reciprocalRankFusion([denseResults, sparseResults])
    .slice(0, topK);

  // Cohere reranking.
  if (useRerank && candidates.length > 0) {
    candidates = await rerank(question, candidates, topN);
  }

  // parentIndex restarts from 0 for every ingested document, so it is not
  // globally unique. Include source in the key to avoid collapsing unrelated
  // parents from different PDFs.
  const seenParents = new Map();
  for (const result of candidates) {
    const parentIndex = result.payload.parentIndex ?? result.payload.chunkIndex;
    const source = result.payload.source ?? 'unknown-source';
    const parentKey = `${source}::${parentIndex}`;
    const score = result.rerankScore ?? result.rrfScore ?? result.score ?? 0;

    if (!seenParents.has(parentKey) || score > (seenParents.get(parentKey)._score || 0)) {
      seenParents.set(parentKey, { ...result, _score: score });
    }
  }

  return Array.from(seenParents.values())
    .sort((a, b) => b._score - a._score);
}

module.exports = { retrieve };
