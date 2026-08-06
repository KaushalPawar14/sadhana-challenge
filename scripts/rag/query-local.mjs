import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const indexDirectory = path.resolve(
  args.get("--index") ?? "./rag-output/prabhupada-local",
);
const query = (args.get("--query") ?? "").trim();
const limit = Math.max(1, Math.min(20, Number(args.get("--limit") ?? "8")));
const typeFilter = args.get("--type")?.toLowerCase();

if (!query) {
  throw new Error(
    "Usage: node scripts/rag/query-local.mjs --query <question> [--index <folder>] [--type <source-type>] [--limit <1-20>]",
  );
}

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "he", "how", "i", "in", "is", "it", "of", "on", "or", "that", "the",
  "this", "to", "was", "what", "when", "where", "which", "who", "why", "with",
]);

function terms(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1 && !stopWords.has(term));
}

const queryTerms = [...new Set(terms(query))];
if (queryTerms.length === 0) throw new Error("The query has no searchable terms.");

const sourcesPath = path.join(indexDirectory, "knowledge-sources.json");
const chunksPath = path.join(indexDirectory, "knowledge-chunks.jsonl");
await Promise.all([access(sourcesPath), access(chunksPath)]);

const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const sourceMap = new Map(sources.map((source) => [source.source_key, source]));
const scored = [];

const input = createReadStream(chunksPath, { encoding: "utf8" });
const lines = readline.createInterface({ input, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.trim()) continue;
  const chunk = JSON.parse(line);
  const source = sourceMap.get(chunk.source_key);
  if (!source || (typeFilter && source.source_type !== typeFilter)) continue;

  const haystack = `${source.title} ${chunk.heading_path} ${chunk.content}`
    .normalize("NFKD")
    .toLowerCase();
  let score = 0;
  let matchedTerms = 0;
  for (const term of queryTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const occurrences = haystack.match(new RegExp(`\\b${escaped}`, "gu"))?.length ?? 0;
    if (occurrences > 0) {
      matchedTerms += 1;
      score += 1 + Math.log2(occurrences + 1);
      if (source.title.normalize("NFKD").toLowerCase().includes(term)) score += 2;
      if (chunk.heading_path.normalize("NFKD").toLowerCase().includes(term)) score += 1;
    }
  }
  if (matchedTerms === 0) continue;
  score *= 0.5 + matchedTerms / queryTerms.length;
  scored.push({ score, matchedTerms, chunk, source });
}

scored.sort((left, right) => right.score - left.score);
const results = scored.slice(0, limit).map(({ score, matchedTerms, chunk, source }) => ({
  score: Number(score.toFixed(3)),
  matched_terms: matchedTerms,
  source_type: source.source_type,
  title: source.title,
  citation: chunk.citation_label,
  file_path: source.file_path,
  chunk_index: chunk.chunk_index,
  excerpt: chunk.content.slice(0, 700),
}));

process.stdout.write(`${JSON.stringify({ query, result_count: results.length, results }, null, 2)}\n`);
