const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { loadPDF } = require('../ingestion/pdfParser');
const { parentChildChunk } = require('../ingestion/chunker');
const { embedBatch } = require('../embedder');
const { storeBatch } = require('../vectorStore');
const { computeSparseVector } = require('../bm25');

router.post('/', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) return res.status(400).json({ error: 'Send { filePath: "path/to/file.pdf" }' });

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) return res.status(400).json({ error: `File not found: ${resolvedPath}` });
    if (path.extname(resolvedPath).toLowerCase() !== '.pdf') {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const docs = await loadPDF(resolvedPath);
    const chunks = await parentChildChunk(docs);
    if (chunks.length === 0) return res.status(400).json({ error: 'PDF produced no chunks' });

    const texts = chunks.map(c => c.pageContent);

    // Dense embeddings — semantic meaning.
    const denseVectors = await embedBatch(texts);

    const points = chunks.map((chunk, i) => ({
      // UUIDs avoid accidental overwrites across separate ingest requests.
      id: randomUUID(),
      vector: {
        dense: denseVectors[i],
        // Deterministic token hashing keeps sparse dimensions consistent
        // across ingestion and query time.
        sparse: computeSparseVector(chunk.pageContent)
      },
      payload: {
        text: chunk.pageContent,
        parentText: chunk.metadata.parentText,
        parentIndex: chunk.metadata.parentIndex,
        source: resolvedPath,
        chunkIndex: i
      }
    }));

    await storeBatch(points);

    res.json({ status: 'ok', pages: docs.length, chunks: chunks.length, pointsStored: points.length });
  } catch (err) {
    console.error('[ingest error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
