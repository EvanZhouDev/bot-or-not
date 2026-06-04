import type { CategoryId } from "./types";

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

export function makeRandomSequence(
  categoryId: CategoryId,
  itemCount: number,
): string[] {
  switch (categoryId) {
    case "numbers":
      return times(itemCount, () => String(randomInt(100)));
    case "digits":
      return times(itemCount, () => String(randomInt(10)));
    case "colors":
      return times(itemCount, randomHexColor);
    case "coin_flips":
      return sampleWithReplacement(coinFaces, itemCount);
    case "directions":
      return sampleWithReplacement(directions, itemCount);
    case "cards":
      return sampleWithoutReplacement(makeDeck(), itemCount);
    case "dates":
      return times(itemCount, randomDate);
  }
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function times<T>(count: number, makeValue: () => T): T[] {
  return Array.from({ length: count }, makeValue);
}

function sampleWithReplacement(values: readonly string[], count: number) {
  return times(count, () => values[randomInt(values.length)]);
}

function sampleWithoutReplacement(values: readonly string[], count: number) {
  return shuffle(values).slice(0, count);
}

function makeDeck() {
  return ranks.flatMap((rank) => suits.map((suit) => `${rank}${suit}`));
}

function randomHexColor() {
  const value = randomInt(0x1000000);
  return `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
}

function randomDate() {
  const start = Date.UTC(1990, 0, 1);
  const end = Date.UTC(2040, 11, 31);
  const dayMs = 24 * 60 * 60 * 1000;
  const dayCount = Math.floor((end - start) / dayMs) + 1;
  const timestamp = start + randomInt(dayCount) * dayMs;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function randomInt(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`invalid random max: ${maxExclusive}`);
  }

  if (!globalThis.crypto?.getRandomValues) {
    return Math.floor(Math.random() * maxExclusive);
  }

  const bucketSize = Math.floor(0x100000000 / maxExclusive);
  const limit = bucketSize * maxExclusive;
  const buffer = new Uint32Array(1);

  while (true) {
    globalThis.crypto.getRandomValues(buffer);

    if (buffer[0] < limit) {
      return Math.floor(buffer[0] / bucketSize);
    }
  }
}
