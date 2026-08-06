const express = require('express');
const router = express.Router();
const { retrieve } = require('../retrieval');
const { chat } = require('../llm');

router.post('/', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question must be a non-empty string' });
    }

    const trimmed = question.trim();
    if (trimmed.length < 3) return res.status(400).json({ error: 'question must be at least 3 characters' });
    if (trimmed.length > 1000) return res.status(400).json({ error: 'question too long — max 1000 characters' });

    const results = await retrieve(trimmed);

    if (results.length === 0) {
      return res.status(200).json({
        answer: 'I could not find relevant information to answer your question.',
        sources: [],
        retrieved: 0
      });
    }

    const context = results
      .map(r => r.payload.parentText || r.payload.text)
      .join('\n\n');

    const answer = await chat([
      { role: 'system', content: 'You are a helpful assistant. Answer the question using only the provided context. If the answer is not in the context, say you do not know.' },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${trimmed}` }
    ]);

    return res.status(200).json({
      answer,
      retrieved: results.length,
      sources: results.map(r => ({
        childText: r.payload.text,
        parentText: r.payload.parentText?.slice(0, 200) ?? null,
        rerankScore: parseFloat((r.rerankScore ?? r.rrfScore ?? 0).toFixed(4)),
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