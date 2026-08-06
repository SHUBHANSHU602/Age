const { chat } = require('./llm');
const { hydeEmbed } = require('./hyde');
const { searchDense } = require('./vectorStore');

// Generates N query variations using Groq, embeds each with HyDE,
// retrieves dense results for each, then merges all result sets.
// Deduplicates by chunk id keeping highest score per chunk.
// Result: broader coverage of the document than any single query achieves.
async function multiQueryRetrieve(question, n = 3, topK = 5) {
  const variations = await chat([
    {
      role: 'system',
      content: `Generate ${n} different phrasings of the user's question. Each should approach the same topic from a different angle. Return only the questions, one per line, no numbering or extra text.`
    },
    {
      role: 'user',
      content: question
    }
  ]);

  const queries = [question, ...variations.split('\n').map(q => q.trim()).filter(Boolean).slice(0, n)];
  console.log(`[multiQuery] running ${queries.length} queries`);

  const allResults = new Map();

  for (const query of queries) {
    const vec = await hydeEmbed(query);
    const results = await searchDense(vec, topK);
    for (const r of results) {
      if (!allResults.has(r.id) || r.score > allResults.get(r.id).score) {
        allResults.set(r.id, r);
      }
    }
  }

  return Array.from(allResults.values()).sort((a, b) => b.score - a.score);
}

module.exports = { multiQueryRetrieve };