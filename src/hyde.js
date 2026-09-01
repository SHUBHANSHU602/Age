const { chat } = require('./llm');
const { embed } = require('./embedder');

// Generates a hypothetical answer to the query using Groq, then embeds it.
// The hypothesis is used only as a retrieval probe; it is not returned as the final answer.
async function hydeEmbed(question) {
  const hypothesis = await chat([
    {
      role: 'system',
      content: 'Generate a short, factual paragraph that would answer the following question. Write as if you are an expert. Do not say you are guessing.'
    },
    {
      role: 'user',
      content: question
    }
  ]);

  console.log(`[HyDE] hypothesis: ${hypothesis.slice(0, 100)}...`);
  return embed(hypothesis);
}

module.exports = { hydeEmbed };
