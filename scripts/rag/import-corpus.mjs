import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const sourceDirectory = args.get("--source");
const outputDirectory = args.get("--output") ?? "./rag-output";
const maxCharacters = Number(args.get("--max-chars") ?? "1600");
const overlapCharacters = Number(args.get("--overlap") ?? "180");

if (!sourceDirectory) {
  throw new Error(
    "Usage: node scripts/rag/import-corpus.mjs --source <markdown-folder> --output <folder>",
  );
}

if (maxCharacters < 500 || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
  throw new Error("Chunk size must be >= 500 and overlap must be smaller than the chunk size.");
}

const allowedTypes = new Set([
  "book",
  "letter",
  "conversation",
  "lecture",
  "glossary",
  "curated_note",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return { metadata: {}, body: markdown };
  const closing = markdown.indexOf("\n---\n", 4);
  if (closing < 0) return { metadata: {}, body: markdown };

  const metadata = {};
  for (const line of markdown.slice(4, closing).split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { metadata, body: markdown.slice(closing + 5) };
}

function classifySource(fileName, metadata) {
  const declared = metadata.source_type?.toLowerCase();
  if (allowedTypes.has(declared)) return declared;
  const lower = fileName.toLowerCase();
  if (lower.includes("letter") || lower.includes("correspondence")) return "letter";
  if (lower.includes("conversation")) return "conversation";
  if (lower.includes("lecture")) return "lecture";
  if (lower.includes("glossary")) return "glossary";
  if (
    lower.includes("readme") ||
    lower.includes("corpus_index") ||
    lower.includes("corpus index") ||
    lower.includes("vocabulary") ||
    lower.includes("source_and_segmentation") ||
    lower.includes("speaker_authority") ||
    lower.includes("citation_guide") ||
    lower.includes("final_qa") ||
    lower.includes("edge_cases") ||
    lower.includes("event_type_guide") ||
    lower.includes("scriptural_reference_guide")
  ) {
    return "curated_note";
  }
  // The reviewed audio package also contains ceremonies, interviews and other
  // spoken events whose filenames do not literally contain "lecture". Keep
  // those in the supported spoken-word category instead of mislabelling them
  // as books.
  if (lower.startsWith("audio-transcripts/")) return "lecture";
  return "book";
}

function chunkMarkdown(markdown) {
  const sections = [];
  let headingPath = "Introduction";
  let buffer = [];

  const flush = () => {
    const content = normalizeText(buffer.join("\n"));
    if (content) sections.push({ headingPath, content });
    buffer = [];
  };

  for (const line of markdown.split("\n")) {
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      headingPath = heading[2].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  const chunks = [];
  for (const section of sections) {
    let cursor = 0;
    while (cursor < section.content.length) {
      let end = Math.min(section.content.length, cursor + maxCharacters);
      if (end < section.content.length) {
        const paragraphBreak = section.content.lastIndexOf("\n\n", end);
        const sentenceBreak = section.content.lastIndexOf(". ", end);
        const preferred = Math.max(paragraphBreak, sentenceBreak);
        if (preferred > cursor + maxCharacters * 0.55) end = preferred + 1;
      }
      const content = section.content.slice(cursor, end).trim();
      if (content) chunks.push({ headingPath: section.headingPath, content });
      if (end >= section.content.length) break;
      cursor = Math.max(cursor + 1, end - overlapCharacters);
    }
  }
  return chunks;
}

async function findMarkdownFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await findMarkdownFiles(fullPath)));
    if (entry.isFile() && /\.md$/i.test(entry.name)) output.push(fullPath);
  }
  return output.sort();
}

const sourceRoot = path.resolve(sourceDirectory);
const files = await findMarkdownFiles(sourceRoot);
if (files.length === 0) throw new Error("No Markdown files were found.");

const sources = [];
const chunks = [];

for (const filePath of files) {
  const raw = normalizeText(await readFile(filePath, "utf8"));
  const { metadata, body } = parseFrontmatter(raw);
  const relativePath = path.relative(sourceRoot, filePath).replaceAll("\\", "/");
  const sourceKey = metadata.source_key || relativePath.replace(/\.md$/i, "");
  const title = metadata.title || path.basename(filePath, path.extname(filePath));
  const sourceType = classifySource(relativePath, metadata);
  const contentHash = sha256(raw);
  const sourceChunks = chunkMarkdown(body);

  sources.push({
    source_key: sourceKey,
    title,
    source_type: sourceType,
    author: metadata.author || "A. C. Bhaktivedanta Swami Prabhupāda",
    file_path: relativePath,
    content_hash: contentHash,
    metadata: { ...metadata, imported_by: "folk-surat-corpus-importer-v1" },
    review_status: "pending",
    version: Number(metadata.version || 1),
  });

  sourceChunks.forEach((chunk, index) => {
    chunks.push({
      source_key: sourceKey,
      chunk_index: index,
      heading_path: chunk.headingPath,
      content: chunk.content,
      citation_label: `${title} — ${chunk.headingPath}`,
      token_count: Math.ceil(chunk.content.length / 4),
      metadata: {
        content_hash: sha256(chunk.content),
        source_file: relativePath,
      },
    });
  });
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "knowledge-sources.json"),
  `${JSON.stringify(sources, null, 2)}\n`,
);
await writeFile(
  path.join(outputDirectory, "knowledge-chunks.jsonl"),
  `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`,
);
await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source_root: sourceRoot,
      source_count: sources.length,
      chunk_count: chunks.length,
      source_inventory_hash: sha256(JSON.stringify(sources)),
      chunks_hash: sha256(JSON.stringify(chunks)),
      upload_performed: false,
      note: "Review inventory before embedding or uploading. Sources remain pending by default.",
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `Prepared ${sources.length} sources and ${chunks.length} chunks in ${path.resolve(outputDirectory)}\n`,
);
