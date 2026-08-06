# Local Prabhupada corpus

The canonical source files remain unchanged in the OneDrive Codex Archive. The
working copy is stored under `local-data/prabhupada-corpus/` and is intentionally
excluded from Git because the Markdown source is approximately 160 MB.

## Working-copy layout

- `books/`: final tagged book corpus
- `audio-transcripts/`: lectures, conversations, ceremonies, and corpus guides
- `correspondence/`: final letters and correspondence corpus

## Rebuild the local index

```powershell
node scripts/rag/import-corpus.mjs --source local-data/prabhupada-corpus --output rag-output/prabhupada-local
```

This creates a reviewable source inventory, line-delimited chunks, and a hash
manifest. Nothing is uploaded and every source starts with `review_status:
pending`.

## Query locally

```powershell
node scripts/rag/query-local.mjs --query "How should a student develop taste for chanting?" --limit 8
```

An optional `--type book|letter|conversation|lecture|glossary|curated_note`
filter can restrict retrieval. This local search is the evidence-retrieval layer;
any student-facing or guide-facing answer must still follow `RAG_GOVERNANCE.md`.
