import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL);
const model = process.env.MODEL;
const batchSize = Number(process.env.SEQUENCE_BATCH_SIZE ?? 25);

const systemPrompt =
  "Return only the requested sequences. Do not add numbering, labels, explanations, or markdown.";

const categories = [
  {
    id: "numbers",
    label: "Numbers",
    itemCount: 10,
    sequenceCount: 100,
    prompt: (count) =>
      `Generate ${count} separate random number sequences, each containing 10 integers from 0 through 99. One sequence on each line.`,
  },
  {
    id: "digits",
    label: "Digits",
    itemCount: 18,
    sequenceCount: 100,
    prompt: (count) =>
      `Generate ${count} separate random digit sequences, each containing 18 single-character digits from 0 through 9. One sequence on each line.`,
  },
  {
    id: "colors",
    label: "Colors",
    itemCount: 8,
    sequenceCount: 100,
    prompt: (count) =>
      `Generate ${count} separate random color sequences, each containing 8 CSS hex colors in #RRGGBB format. One sequence on each line.`,
  },
  {
    id: "coin_flips",
    label: "Coin Flips",
    itemCount: 16,
    sequenceCount: 100,
    prompt: (count) =>
      `Generate ${count} separate random coin-flip sequences, each containing 16 values where each value is H or T. One sequence on each line.`,
  },
  {
    id: "directions",
    label: "Directions",
    itemCount: 12,
    sequenceCount: 100,
    prompt: (count) =>
      `Generate ${count} separate random direction sequences, each containing 12 values chosen from Up, Down, Left, and Right. One sequence on each line.`,
  },
  {
    id: "cards",
    label: "Cards",
    itemCount: 8,
    sequenceCount: 100,
    prompt: (count) =>
      `Generate ${count} separate random playing-card sequences, each containing 8 standard playing cards such as AH, 7D, QS, or 10C. One sequence on each line.`,
  },
  {
    id: "dates",
    label: "Dates",
    itemCount: 8,
    sequenceCount: 100,
    prompt: (count) =>
      `Generate ${count} separate random date sequences, each containing 8 ISO dates between 1990-01-01 and 2040-12-31. One sequence on each line.`,
  },
];

const generatedAt = new Date().toISOString();
const items = [];

for (const category of categories) {
  const records = await generateCategory(category);

  for (const [index, record] of records.entries()) {
    items.push({
      id: `${category.id}-${String(index + 1).padStart(3, "0")}`,
      categoryId: category.id,
      categoryLabel: category.label,
      generationNumber: index + 1,
      model,
      prompt: `System:\n${systemPrompt}\n\nUser:\n${record.prompt}`,
      generatedAt,
      sequence: record.sequence,
    });
  }

  console.log(`generated ${category.label}: ${records.length} sequences`);
}

const corpus = {
  schemaVersion: 1,
  generatedAt,
  endpoint: baseUrl,
  model,
  categories: categories.map(({ id, label, itemCount, sequenceCount }) => ({
    id,
    label,
    itemCount,
    sequenceCount,
  })),
  items,
};

await mkdir(path.join(projectRoot, "data"), { recursive: true });
await writeFile(
  path.join(projectRoot, "data", "corpus.generated.json"),
  `${JSON.stringify(corpus, null, 2)}\n`,
);

console.log(`saved ${items.length} AI sequences to data/corpus.generated.json`);

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function generateCategory(category) {
  const records = [];

  while (records.length < category.sequenceCount) {
    const count = Math.min(batchSize, category.sequenceCount - records.length);
    const prompt = category.prompt(count);
    const sequences = await generateBatch(category, prompt, count);

    records.push(...sequences.map((sequence) => ({ prompt, sequence })));
    console.log(
      `  ${category.label}: ${records.length}/${category.sequenceCount}`,
    );
  }

  return records;
}

async function generateBatch(category, prompt, count) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const content = await requestCompletion(prompt);
      return parseSequences(content, category, count);
    } catch (error) {
      lastError = error;
      console.warn(
        `retrying ${category.label} batch after attempt ${attempt}: ${error.message}`,
      );
    }
  }

  throw lastError;
}

async function requestCompletion(prompt) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 1.35,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed ${response.status}: ${body}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("OpenAI response did not contain message content");
  }

  return content;
}

function parseSequences(content, category, count) {
  const lines = content
    .replace(/^```(?:text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(stripLinePrefix);

  const sequences = lines
    .map((line) => parseLine(line, category))
    .filter((sequence) => sequence.length === category.itemCount)
    .slice(0, count);

  if (sequences.length !== count) {
    throw new Error(
      `expected ${count} valid sequences, got ${sequences.length}`,
    );
  }

  return sequences;
}

function stripLinePrefix(line) {
  return line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim();
}

function parseLine(line, category) {
  switch (category.id) {
    case "numbers":
      return parseMatches(line, /\b(?:\d|[1-9]\d)\b/g, category.itemCount);
    case "digits":
      return parseMatches(line, /\d/g, category.itemCount);
    case "colors":
      return parseMatches(line, /#[0-9a-f]{6}\b/gi, category.itemCount).map(
        (color) => color.toUpperCase(),
      );
    case "coin_flips":
      return parseMatches(line, /\b[HT]\b|[HT]/g, category.itemCount);
    case "directions":
      return parseMatches(
        line,
        /\b(?:Up|Down|Left|Right)\b/gi,
        category.itemCount,
      ).map(titleCase);
    case "cards":
      return parseMatches(
        line,
        /\b(?:A|[2-9]|10|J|Q|K)[HDCS]\b/gi,
        category.itemCount,
      ).map((card) => card.toUpperCase());
    case "dates":
      return parseMatches(
        line,
        /\b(?:199\d|20[0-3]\d|2040)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
        category.itemCount,
      );
  }
}

function parseMatches(line, expression, itemCount) {
  return [...line.matchAll(expression)]
    .map((match) => match[0])
    .slice(0, itemCount);
}

function titleCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}
