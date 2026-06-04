import type { CategorySpec } from "../lib/types";

export const categorySpecs = [
  {
    id: "numbers",
    label: "Numbers",
    shortLabel: "Nums",
    kind: "token",
    itemCount: 10,
    sequenceCount: 100,
    promptInstruction:
      "Generate 100 separate random number sequences, each containing 10 integers from 0 through 99. One sequence on each line.",
  },
  {
    id: "digits",
    label: "Digits",
    shortLabel: "Digits",
    kind: "token",
    itemCount: 18,
    sequenceCount: 100,
    promptInstruction:
      "Generate 100 separate random digit sequences, each containing 18 single-character digits from 0 through 9. One sequence on each line.",
  },
  {
    id: "colors",
    label: "Colors",
    shortLabel: "Colors",
    kind: "color",
    itemCount: 8,
    sequenceCount: 100,
    promptInstruction:
      "Generate 100 separate random color sequences, each containing 8 CSS hex colors in #RRGGBB format. One sequence on each line.",
  },
  {
    id: "coin_flips",
    label: "Coins",
    shortLabel: "Coins",
    kind: "token",
    itemCount: 16,
    sequenceCount: 100,
    promptInstruction:
      "Generate 100 separate random coin-flip sequences, each containing 16 values where each value is H or T. One sequence on each line.",
  },
  {
    id: "directions",
    label: "Directions",
    shortLabel: "Dirs",
    kind: "token",
    itemCount: 12,
    sequenceCount: 100,
    promptInstruction:
      "Generate 100 separate random direction sequences, each containing 12 values chosen from Up, Down, Left, and Right. One sequence on each line.",
  },
  {
    id: "cards",
    label: "Cards",
    shortLabel: "Cards",
    kind: "token",
    itemCount: 8,
    sequenceCount: 100,
    promptInstruction:
      "Generate 100 separate random playing-card sequences, each containing 8 standard playing cards such as AH, 7D, QS, or 10C. One sequence on each line.",
  },
  {
    id: "dates",
    label: "Dates",
    shortLabel: "Dates",
    kind: "token",
    itemCount: 8,
    sequenceCount: 100,
    promptInstruction:
      "Generate 100 separate random date sequences, each containing 8 ISO dates between 1990-01-01 and 2040-12-31. One sequence on each line.",
  },
] as const satisfies readonly CategorySpec[];

export const categoryById = Object.fromEntries(
  categorySpecs.map((category) => [category.id, category]),
) as Record<
  (typeof categorySpecs)[number]["id"],
  (typeof categorySpecs)[number]
>;
