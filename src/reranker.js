const { CohereClient } = require('cohere-ai');

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY || process.env.COHORE_API_KEY
});

// Takes a query string and array of result objects from Qdrant.
// Sends them to Cohere's rerank endpoint which scores each chunk
// for true relevance to the query using a cross-encoder model.
// Returns results sorted by rerank score, highest first.
async function rerank(query, results, topN = 4) {
  if (results.length === 0) return [];

  const documents = results.map(r => r.payload.parentText || r.payload.text);

  const response = await cohere.rerank({
    model: 'rerank-english-v3.0',
    query,
    documents,
    topN
  });

  // Map reranked indices back to original result objects
  return response.results.map(r => ({
    ...results[r.index],
    rerankScore: r.relevanceScore
  }));
}

module.exports = { rerank };