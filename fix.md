# Fix Log

This file records verified fixes made to the implemented indexing and retrieval pipeline.

## 2026-09-01

### 1. Fixed broken HyDE module filename

**Problem**

`src/multiQuery.js` imports:

```js
require('./hyde')
```

but the repository contained the file as `src/hydejs`. Node resolves `./hyde` to files such as `hyde.js`, so the retrieval path could fail with a module-not-found error.

**Fix**

- Added the correctly named `src/hyde.js`.
- Removed the misnamed `src/hydejs` file.
- Kept the existing `hydeEmbed()` behavior unchanged.

---

### 2. Fixed inconsistent sparse-vector token mapping

**Problem**

The previous sparse retrieval code built a vocabulary separately during ingestion and again from the query at retrieval time. Sparse vector indices only have meaning when the same term always maps to the same index.

Example of the old failure mode:

```text
Ingest vocabulary:  "rotation" -> 17
Query vocabulary:   "rotation" -> 2
```

Qdrant would compare dimension `17` with dimension `2`, so an exact matching word was not guaranteed to match at all. The issue also affected documents ingested in different sessions because every ingest built a new vocabulary.

**Fix**

- Removed request-local vocabulary dependence from sparse vector generation.
- Added deterministic FNV-1a token hashing in `src/bm25.js`.
- The same normalized token now maps to the same sparse index during ingestion, querying, across documents, and across server restarts.
- Added collision aggregation so a sparse vector never sends duplicate indices to Qdrant.
- Updated `src/routes/ingest.js`, `src/retrieval.js`, and `src/benchmark.js` to use the corrected sparse-vector API.

**Important terminology correction**

The current implementation uses **TF-normalized sparse lexical weights**. It is not a complete canonical BM25 implementation because it does not currently compute corpus-level IDF and BM25 length-normalization terms. Existing function/file names are retained for project continuity, but code comments now state this accurately.

**Required action after this fix**

Existing points in Qdrant were created with the old incompatible sparse index mapping. Reset/recreate the collection and re-ingest the PDFs before evaluating sparse or hybrid retrieval again.

---

### 3. Fixed possible Qdrant point-ID collisions across ingests

**Problem**

The ingest route previously generated IDs with:

```js
const baseId = Math.floor(Math.random() * 1_000_000_000);
id: baseId + i;
```

Separate ingest requests could theoretically generate overlapping ranges. Because Qdrant upsert replaces an existing point with the same ID, a collision could silently overwrite previously indexed chunks.

**Fix**

- Replaced random numeric ranges with Node's `crypto.randomUUID()` for every Qdrant point.

---

### 4. Fixed parent deduplication across multiple PDFs

**Problem**

`parentIndex` starts from `0` for every document. Retrieval previously deduplicated candidates using only `parentIndex`.

That means:

```text
PDF A / parentIndex 0
PDF B / parentIndex 0
```

were incorrectly treated as the same parent, causing one document's relevant context to be dropped.

**Fix**

Parent deduplication now uses a compound identity:

```text
source + parentIndex
```

so parents from different PDFs remain distinct while multiple child hits from the same actual parent are still collapsed.

---

### 5. Improved PDF extension validation

**Problem**

The ingest route checked:

```js
resolvedPath.endsWith('.pdf')
```

which rejects valid uppercase/mixed-case extensions such as `.PDF`.

**Fix**

Validation now uses:

```js
path.extname(resolvedPath).toLowerCase() === '.pdf'
```

---

## Scope note

The fixes above target the indexing and retrieval pipeline currently being prepared: parsing/chunking, dense and sparse representations, Qdrant storage, Multi-Query, HyDE, dense+sparse retrieval, RRF, Cohere reranking, and parent deduplication.

The repository currently also contains a basic Groq answer-generation step in `src/routes/query.js`. It was **not changed in this pass**, because generation/agentic behavior is outside the requested implemented scope and should be reviewed separately when that phase begins.
