# Prabhupāda-grounded retrieval contract

## Purpose

The system retrieves principle-level guidance from the supplied, reviewed Markdown corpus. It does not impersonate Śrīla Prabhupāda, invent quotations, diagnose a student, or replace the FOLK guide's practical judgment.

## Pipeline

1. Run `node scripts/rag/import-corpus.mjs --source <corpus-folder> --output <review-folder>`.
2. Review the source inventory, detected source types, titles, relative paths, hashes and chunk citations.
3. Upload sources and chunks with `review_status = pending`.
4. Approve verified sources separately; retrieval only searches approved sources.
5. Generate embeddings using the selected 1536-dimensional embedding model after credentials are configured.
6. Retrieve a small evidence set, draft principle guidance with citations, and separate it from the guide's practical next action.
7. Escalate personal or sensitive matters to the assigned guide. The guide sees the conversation under the one-time student notice.

## Answer shapes

- Student: warm principle, one practical sādhana step, optional reflective question, sources, and guide handoff when appropriate. Never expose LIT, mentor notes, prioritization, or private assessment.
- Guide: observed evidence, grounded principle, suggested next step, “why this guidance,” confidence, missing information, and citations. The guide approves any message or practical intervention.
- RDUA: verbatim approved passage, source label, three reflection questions per five-paragraph unit, optional leader help, and no invented quotation.

## Retention and review

- Preserve content hashes, source versions and citation labels.
- Reject or quarantine duplicate, corrupted or unverified sources.
- Keep raw mentor dictation only until the mentor approves the concise summary.
- Never upload the synthetic fixture to the production corpus.
