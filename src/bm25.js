// Sparse lexical vector generation for Qdrant.
//
// IMPORTANT: this is TF-normalized lexical weighting, not canonical BM25.
// The previous implementation built a fresh vocabulary independently during
// ingestion and query time, so the same token could map to different indices.
// That made sparse retrieval incorrect. We now derive each token index from a
// deterministic hash so the same token always maps to the same sparse dimension
// across requests, documents, and server restarts.

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

// FNV-1a 32-bit hash. Qdrant sparse-vector indices are non-negative integers.
function tokenToIndex(token) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function computeSparseVector(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { indices: [], values: [] };

  const termFreq = new Map();
  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) || 0) + 1);
  }

  // Hash collisions are rare but possible. Aggregate colliding token weights
  // so Qdrant never receives duplicate indices in one sparse vector.
  const weightsByIndex = new Map();
  for (const [term, freq] of termFreq.entries()) {
    const index = tokenToIndex(term);
    const weight = freq / tokens.length;
    weightsByIndex.set(index, (weightsByIndex.get(index) || 0) + weight);
  }

  const entries = Array.from(weightsByIndex.entries()).sort((a, b) => a[0] - b[0]);
  return {
    indices: entries.map(([index]) => index),
    values: entries.map(([, value]) => value)
  };
}

module.exports = { tokenize, tokenToIndex, computeSparseVector };
