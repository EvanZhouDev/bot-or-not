export type CategoryId =
  | "numbers"
  | "digits"
  | "colors"
  | "coin_flips"
  | "directions"
  | "cards"
  | "dates";

export type CategoryKind = "token" | "color";

export type CategorySpec = {
  id: CategoryId;
  label: string;
  shortLabel: string;
  kind: CategoryKind;
  itemCount: number;
  sequenceCount: number;
  promptInstruction: string;
};

export type CorpusItem = {
  id: string;
  categoryId: CategoryId;
  categoryLabel: string;
  generationNumber: number;
  model: string;
  prompt: string;
  generatedAt: string;
  sequence: string[];
};

export type CorpusFile = {
  schemaVersion: 1;
  generatedAt: string;
  endpoint: string;
  model: string;
  categories: Pick<
    CategorySpec,
    "id" | "label" | "itemCount" | "sequenceCount"
  >[];
  items: CorpusItem[];
};
