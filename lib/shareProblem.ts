import type { CategoryId } from "./types";

export type SharedProblem = {
  v: 1;
  c: CategoryId;
  o: string[][];
  a: number;
};

const compactPrefix = "v2.";
const legacyVersion = 1;
const compactVersion = 2;
const optionCount = 4;
const dateStart = Date.UTC(1990, 0, 1);
const dateEnd = Date.UTC(2040, 11, 31);
const dayMs = 24 * 60 * 60 * 1000;
const dateDayCount = Math.floor((dateEnd - dateStart) / dayMs) + 1;

const categoryIds = [
  "numbers",
  "digits",
  "colors",
  "coin_flips",
  "directions",
  "cards",
  "dates",
] as const satisfies readonly CategoryId[];

const categorySet = new Set<CategoryId>(categoryIds);
const directions = ["Up", "Down", "Left", "Right"];
const coinFaces = ["H", "T"];
const suits = ["H", "D", "C", "S"];
const ranks = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export function encodeProblem(problem: SharedProblem) {
  const compact = encodeCompactProblem(problem);

  if (compact) {
    return `${compactPrefix}${bytesToBase64Url(compact)}`;
  }

  return encodeLegacyProblem(problem);
}

export function decodeProblem(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith(compactPrefix)) {
    try {
      return decodeCompactProblem(base64UrlToBytes(value.slice(3)));
    } catch {
      return null;
    }
  }

  return decodeLegacyProblem(value);
}

function encodeLegacyProblem(problem: SharedProblem) {
  const json = JSON.stringify(problem);
  const bytes = new TextEncoder().encode(json);

  return bytesToBase64Url(bytes);
}

function decodeLegacyProblem(value: string) {
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(value)),
    ) as unknown;

    return normalizeProblem(parsed);
  } catch {
    return null;
  }
}

function encodeCompactProblem(problem: SharedProblem) {
  const normalized = normalizeProblem(problem);

  if (!normalized) {
    return null;
  }

  const categoryIndex = categoryIds.indexOf(normalized.c);
  const sequenceLength = normalized.o[0]?.length ?? 0;

  if (
    categoryIndex < 0 ||
    sequenceLength <= 0 ||
    sequenceLength > 255 ||
    normalized.o.some((sequence) => sequence.length !== sequenceLength)
  ) {
    return null;
  }

  const config = compactConfigs[normalized.c];
  const values: number[] = [];

  for (const sequence of normalized.o) {
    for (const token of sequence) {
      const value = config.encode(token);

      if (value === null) {
        return null;
      }

      values.push(value);
    }
  }

  return Uint8Array.from([
    compactVersion,
    categoryIndex,
    normalized.a,
    normalized.o.length,
    sequenceLength,
    ...packValues(values, config.bits),
  ]);
}

function decodeCompactProblem(bytes: Uint8Array): SharedProblem | null {
  if (bytes.length < 5 || bytes[0] !== compactVersion) {
    return null;
  }

  const category = categoryIds[bytes[1]];
  const answerIndex = bytes[2];
  const count = bytes[3];
  const sequenceLength = bytes[4];

  if (
    !category ||
    count !== optionCount ||
    answerIndex >= count ||
    sequenceLength <= 0
  ) {
    return null;
  }

  const config = compactConfigs[category];
  const valueCount = count * sequenceLength;
  const packedBytes = bytes.slice(5);
  const values = unpackValues(packedBytes, config.bits, valueCount);

  if (!values) {
    return null;
  }

  const options: string[][] = [];

  for (let optionIndex = 0; optionIndex < count; optionIndex += 1) {
    const sequence: string[] = [];

    for (let tokenIndex = 0; tokenIndex < sequenceLength; tokenIndex += 1) {
      const value = values[optionIndex * sequenceLength + tokenIndex];
      const token = config.decode(value);

      if (token === null) {
        return null;
      }

      sequence.push(token);
    }

    options.push(sequence);
  }

  return {
    v: legacyVersion,
    c: category,
    o: options,
    a: answerIndex,
  };
}

function normalizeProblem(value: unknown): SharedProblem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const problem = value as Partial<SharedProblem>;

  if (
    problem.v !== legacyVersion ||
    typeof problem.c !== "string" ||
    !categorySet.has(problem.c as CategoryId) ||
    !Number.isInteger(problem.a) ||
    typeof problem.a !== "number" ||
    !Array.isArray(problem.o) ||
    problem.o.length !== optionCount ||
    problem.a < 0 ||
    problem.a >= problem.o.length
  ) {
    return null;
  }

  const options = problem.o.map((sequence) => {
    if (
      !Array.isArray(sequence) ||
      sequence.length === 0 ||
      sequence.some((token) => typeof token !== "string")
    ) {
      return null;
    }

    return sequence;
  });

  if (options.some((sequence) => sequence === null)) {
    return null;
  }

  return {
    v: legacyVersion,
    c: problem.c as CategoryId,
    o: options as string[][],
    a: problem.a,
  };
}

const compactConfigs: Record<
  CategoryId,
  {
    bits: number;
    encode: (token: string) => number | null;
    decode: (value: number) => string | null;
  }
> = {
  numbers: {
    bits: 7,
    encode: (token) => encodeInteger(token, 0, 99),
    decode: (value) => (value <= 99 ? String(value) : null),
  },
  digits: {
    bits: 4,
    encode: (token) => (/^\d$/.test(token) ? Number(token) : null),
    decode: (value) => (value <= 9 ? String(value) : null),
  },
  colors: {
    bits: 24,
    encode: (token) =>
      /^#[0-9A-Fa-f]{6}$/.test(token)
        ? Number.parseInt(token.slice(1), 16)
        : null,
    decode: (value) =>
      value <= 0xffffff
        ? `#${value.toString(16).padStart(6, "0").toUpperCase()}`
        : null,
  },
  coin_flips: {
    bits: 1,
    encode: (token) => encodeFromList(coinFaces, token),
    decode: (value) => coinFaces[value] ?? null,
  },
  directions: {
    bits: 2,
    encode: (token) => encodeFromList(directions, token),
    decode: (value) => directions[value] ?? null,
  },
  cards: {
    bits: 6,
    encode: encodeCard,
    decode: decodeCard,
  },
  dates: {
    bits: 15,
    encode: encodeDate,
    decode: decodeDate,
  },
};

function encodeInteger(token: string, min: number, max: number) {
  if (!/^\d+$/.test(token)) {
    return null;
  }

  const value = Number(token);

  return value >= min && value <= max ? value : null;
}

function encodeFromList(values: readonly string[], token: string) {
  const index = values.indexOf(token);

  return index >= 0 ? index : null;
}

function encodeCard(token: string) {
  const suit = token.slice(-1);
  const rank = token.slice(0, -1);
  const rankIndex = ranks.indexOf(rank);
  const suitIndex = suits.indexOf(suit);

  if (rankIndex < 0 || suitIndex < 0) {
    return null;
  }

  return rankIndex * suits.length + suitIndex;
}

function decodeCard(value: number) {
  if (value < 0 || value >= ranks.length * suits.length) {
    return null;
  }

  return `${ranks[Math.floor(value / suits.length)]}${suits[value % suits.length]}`;
}

function encodeDate(token: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(token)) {
    return null;
  }

  const [year, month, day] = token.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const normalized = new Date(timestamp).toISOString().slice(0, 10);

  if (normalized !== token) {
    return null;
  }

  const offset = Math.floor((timestamp - dateStart) / dayMs);

  return offset >= 0 && offset < dateDayCount ? offset : null;
}

function decodeDate(value: number) {
  if (value < 0 || value >= dateDayCount) {
    return null;
  }

  return new Date(dateStart + value * dayMs).toISOString().slice(0, 10);
}

function packValues(values: number[], bits: number) {
  const bytes: number[] = [];
  let current = 0;
  let usedBits = 0;

  for (const value of values) {
    for (let bit = bits - 1; bit >= 0; bit -= 1) {
      current = (current << 1) | ((value >> bit) & 1);
      usedBits += 1;

      if (usedBits === 8) {
        bytes.push(current);
        current = 0;
        usedBits = 0;
      }
    }
  }

  if (usedBits > 0) {
    bytes.push(current << (8 - usedBits));
  }

  return bytes;
}

function unpackValues(bytes: Uint8Array, bits: number, count: number) {
  if (bytes.length !== Math.ceil((bits * count) / 8)) {
    return null;
  }

  const values: number[] = [];
  let byteIndex = 0;
  let usedBits = 0;

  for (let valueIndex = 0; valueIndex < count; valueIndex += 1) {
    let value = 0;

    for (let bit = 0; bit < bits; bit += 1) {
      value <<= 1;
      value |= (bytes[byteIndex] >> (7 - usedBits)) & 1;
      usedBits += 1;

      if (usedBits === 8) {
        byteIndex += 1;
        usedBits = 0;
      }
    }

    values.push(value);
  }

  return values;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
