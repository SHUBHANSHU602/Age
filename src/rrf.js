// Reciprocal Rank Fusion merges multiple ranked lists into one.
// Formula: RRF(d) = sum over each list of 1 / (k + rank)
// k=60 is the standard constant that dampens the impact of very high ranks.
// Pure rank-based — raw scores are completely ignored, eliminating scale mismatch.

function reciprocalRankFusion(rankedLists, k = 60) {
  const scores = new Map();
  const items = new Map();

  for (const list of rankedLists) {
    list.forEach((item, index) => {
      const rank = index + 1;
      const id = item.id;
      const rrfScore = 1 / (k + rank);

      scores.set(id, (scores.get(id) || 0) + rrfScore);
      if (!items.has(id)) items.set(id, item);
    });
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, rrfScore]) => ({ ...items.get(id), rrfScore }));
}

module.exports = { reciprocalRankFusion };