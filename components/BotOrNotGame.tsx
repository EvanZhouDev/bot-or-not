"use client";

import { ArrowRight, Bot, CircleHelp, Dices, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { categoryById, categorySpecs } from "../data/categories";
import corpusJson from "../data/corpus.generated.json";
import { directionArrowPath } from "../lib/directionVisuals";
import { makeRandomSequence, shuffle } from "../lib/randomSequences";
import {
  decodeProblem,
  encodeProblem,
  type SharedProblem,
} from "../lib/shareProblem";
import type { CategoryId, CorpusFile, CorpusItem } from "../lib/types";

type CategoryFilter = "all" | CategoryId;

type SequenceOption = {
  id: string;
  source: "ai" | "random";
  sequence: string[];
};

type Puzzle = {
  id: string;
  item: CorpusItem;
  options: SequenceOption[];
};

type Stats = {
  played: number;
  correct: number;
  streak: number;
  bestStreak: number;
};

type StatsByCategory = Record<CategoryFilter, Stats>;

type SharedProblemState = {
  code: string;
  problem: SharedProblem;
};

const corpus = corpusJson as CorpusFile;
const allItems = corpus.items;
const optionCount = 4;
const choiceLabels = ["A", "B", "C", "D"];
const defaultStats: Stats = {
  played: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
};
const categoryFilters: CategoryFilter[] = [
  "all",
  ...categorySpecs.map((category) => category.id),
];
const defaultStatsByCategory = makeDefaultStatsByCategory();
const statsStorageKey = "bot-or-not:stats";
const guideStorageKey = "bot-or-not:show-guide";
const lastCategoryStorageKey = "bot-or-not:last-category";

export function BotOrNotGame() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [queue, setQueue] = useState<CorpusItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [sharedProblem, setSharedProblem] = useState<
    SharedProblemState | null | undefined
  >(undefined);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const [statsByCategory, setStatsByCategory] = useState<StatsByCategory>(
    defaultStatsByCategory,
  );
  const [storageReady, setStorageReady] = useState(false);
  const consumedSharedProblemRef = useRef(false);

  const filteredItems = useMemo(() => {
    if (categoryFilter === "all") {
      return allItems;
    }

    return allItems.filter((item) => item.categoryId === categoryFilter);
  }, [categoryFilter]);

  const stats = statsByCategory[categoryFilter];

  const startRun = useCallback(
    ({
      resetGuide = false,
      resetStats = false,
    }: {
      resetGuide?: boolean;
      resetStats?: boolean;
    } = {}) => {
      const nextQueue = shuffle(filteredItems);
      const nextPuzzle = nextQueue[0] ? makePuzzle(nextQueue[0]) : null;

      setQueue(nextQueue);
      setQueueIndex(0);
      setPuzzle(nextPuzzle);
      setSelectedOptionId(null);
      setShareStatus("idle");

      if (resetGuide) {
        setShowGuide(true);
      }

      if (resetStats) {
        setStatsByCategory((current) => ({
          ...current,
          [categoryFilter]: defaultStats,
        }));
      }
    },
    [categoryFilter, filteredItems],
  );

  useEffect(() => {
    const nextSharedProblem = readSharedProblemFromLocation();
    consumedSharedProblemRef.current = Boolean(nextSharedProblem);

    if (nextSharedProblem) {
      clearProblemFromLocation();
    }

    setSharedProblem(nextSharedProblem);
  }, []);

  useEffect(() => {
    if (sharedProblem === undefined) {
      return;
    }

    if (sharedProblem) {
      const sharedCategoryItems = allItems.filter(
        (item) => item.categoryId === sharedProblem.problem.c,
      );

      setCategoryFilter(sharedProblem.problem.c);
      setQueue(shuffle(sharedCategoryItems));
      setQueueIndex(0);
      setPuzzle(makePuzzleFromSharedProblem(sharedProblem));
      setSelectedOptionId(null);
      setShareStatus("idle");
      return;
    }

    startRun();
  }, [sharedProblem, startRun]);

  function restartCurrentMode() {
    setSharedProblem(null);
    startRun({ resetGuide: true, resetStats: true });
  }

  function changeCategory(value: CategoryFilter) {
    setSharedProblem(null);
    setCategoryFilter(value);
    writeStorage(lastCategoryStorageKey, value);
  }

  useEffect(() => {
    const storedStats = readStoredStatsByCategory();
    const storedGuide = readStoredGuide();
    const storedCategory = consumedSharedProblemRef.current
      ? null
      : readStoredCategoryFilter();

    if (storedStats) {
      setStatsByCategory(storedStats);
    }

    if (storedGuide !== null) {
      setShowGuide(storedGuide);
    }

    if (storedCategory) {
      setCategoryFilter(storedCategory);
    }

    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    writeStorage(statsStorageKey, statsByCategory);
  }, [statsByCategory, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    writeStorage(guideStorageKey, showGuide);
  }, [showGuide, storageReady]);

  const selectedOption = puzzle?.options.find(
    (option) => option.id === selectedOptionId,
  );
  const answered = Boolean(selectedOption);

  function chooseOption(option: SequenceOption) {
    if (!puzzle || selectedOptionId) {
      return;
    }

    const correct = option.source === "ai";

    setSelectedOptionId(option.id);
    setShowGuide(false);
    setShareStatus("idle");
    setStatsByCategory((current) => {
      const currentModeStats = current[categoryFilter];
      const nextStreak = correct ? currentModeStats.streak + 1 : 0;

      return {
        ...current,
        [categoryFilter]: {
          played: currentModeStats.played + 1,
          correct: currentModeStats.correct + (correct ? 1 : 0),
          streak: nextStreak,
          bestStreak: Math.max(currentModeStats.bestStreak, nextStreak),
        },
      };
    });
  }

  function nextPuzzle() {
    if (queue.length === 0) {
      return;
    }

    const nextIndex = (queueIndex + 1) % queue.length;
    const nextQueue = nextIndex === 0 ? shuffle(queue) : queue;
    const nextItem = nextQueue[nextIndex];

    setQueue(nextQueue);
    setQueueIndex(nextIndex);
    setPuzzle(makePuzzle(nextItem));
    setSelectedOptionId(null);
    setShareStatus("idle");
  }

  async function shareCurrentProblem() {
    if (!puzzle || !selectedOption) {
      return;
    }

    const shareUrl = makeShareUrl(puzzle);

    if (!shareUrl) {
      return;
    }

    const shareText =
      selectedOption.source === "ai"
        ? `I spotted the imposter row. Can you?\n${shareUrl}`
        : `The imposter row fooled me. Can you spot it?\n${shareUrl}`;

    await copyText(shareText);
    setShareStatus("copied");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Bot size={22} strokeWidth={2.1} />
          </span>
          <h1>Bot or Not</h1>
          <label className="category-select">
            <span className="sr-only">Category</span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                changeCategory(event.target.value as CategoryFilter)
              }
            >
              <option value="all">Mixed</option>
              {categorySpecs.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="top-actions">
          <div className="score">
            <span>Score</span>
            <strong>
              {stats.correct}/{stats.played}
            </strong>
          </div>
          <div className="score">
            <span>Streak</span>
            <strong>{stats.streak}</strong>
          </div>
          <div className="score">
            <span>Best Streak</span>
            <strong>{stats.bestStreak}</strong>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={restartCurrentMode}
            title="Restart"
            aria-label="Restart"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <section className="arena" aria-live="polite">
        <QuestionPrompt
          showGuide={showGuide}
          onShowGuide={() => setShowGuide(true)}
        />

        <div className="option-grid">
          {puzzle?.options.map((option, index) => (
            <button
              type="button"
              className={optionClassName(option, selectedOptionId)}
              data-category={puzzle.item.categoryId}
              key={option.id}
              onClick={() => chooseOption(option)}
            >
              <ChoiceMarker
                label={choiceLabels[index]}
                option={option}
                selectedOptionId={selectedOptionId}
              />
              <SequenceView
                categoryId={puzzle.item.categoryId}
                sequence={option.sequence}
              />
            </button>
          ))}
        </div>

        {answered ? (
          <div className="arena-footer">
            <button
              type="button"
              className="share-button"
              onClick={shareCurrentProblem}
            >
              {shareStatus === "copied" ? "Copied" : "Share Problem"}
            </button>
            <button type="button" className="next-button" onClick={nextPuzzle}>
              Next
              <ArrowRight size={18} />
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function QuestionPrompt({
  showGuide,
  onShowGuide,
}: {
  showGuide: boolean;
  onShowGuide: () => void;
}) {
  return (
    <div className="question-row">
      <GuideQuestionSizer />
      {showGuide ? (
        <GuideQuestion className="question-active" />
      ) : (
        <div className="question-active compact-question">
          <h2 className="question">Which sequence was generated by AI?</h2>
          <button
            type="button"
            className="help-button"
            onClick={onShowGuide}
            title="Show help"
            aria-label="Show help"
          >
            <CircleHelp size={18} strokeWidth={2.1} />
          </button>
        </div>
      )}
    </div>
  );
}

function GuideQuestion({ className }: { className: string }) {
  return (
    <h2 className={`question ${className}`}>
      Pick the AI-generated sequence pretending to be random.{" "}
      <span>The other 3 are actually random.</span>
    </h2>
  );
}

function GuideQuestionSizer() {
  return (
    <div aria-hidden="true" className="question question-sizer">
      Pick the AI-generated sequence pretending to be random.{" "}
      <span>The other 3 are actually random.</span>
    </div>
  );
}

function ChoiceMarker({
  label,
  option,
  selectedOptionId,
}: {
  label: string;
  option: SequenceOption;
  selectedOptionId: string | null;
}) {
  if (!selectedOptionId) {
    return <span className="option-kicker">{label}</span>;
  }

  if (option.source === "ai") {
    return (
      <span className="option-kicker reveal-icon ai-icon">
        <Bot size={18} strokeWidth={2.2} />
      </span>
    );
  }

  if (option.id === selectedOptionId) {
    return (
      <span className="option-kicker reveal-icon wrong-icon">
        <X size={20} strokeWidth={2.4} />
      </span>
    );
  }

  return (
    <span className="option-kicker reveal-icon random-icon">
      <Dices size={18} strokeWidth={2.1} />
    </span>
  );
}

function SequenceView({
  categoryId,
  sequence,
}: {
  categoryId: CategoryId;
  sequence: string[];
}) {
  const category = categoryById[categoryId];

  switch (category.id) {
    case "numbers":
      return (
        <span className="number-sequence">
          {sequence.map((token, index) => (
            <span className="number-tile" key={`${token}-${index}`}>
              {token}
            </span>
          ))}
        </span>
      );
    case "digits":
      return (
        <span className="digit-sequence">
          {sequence.map((token, index) => (
            <span className="digit-tile" key={`${token}-${index}`}>
              {token}
            </span>
          ))}
        </span>
      );
    case "colors":
      return (
        <span className="color-sequence">
          {sequence.map((token, index) => {
            const color = safeColor(token);

            return (
              <span
                className="color-chip"
                key={`${token}-${index}`}
                style={{ backgroundColor: color }}
              >
                <span className="color-code" style={colorCodeStyle(color)}>
                  {token}
                </span>
              </span>
            );
          })}
        </span>
      );
    case "coin_flips":
      return (
        <span className="coin-sequence">
          {sequence.map((token, index) => (
            <span
              className={token === "H" ? "coin coin-heads" : "coin coin-tails"}
              key={`${token}-${index}`}
            >
              {token}
            </span>
          ))}
        </span>
      );
    case "directions":
      return (
        <span className="direction-sequence">
          {sequence.map((token, index) => (
            <span
              className={`direction-tile ${directionClassName(token)}`}
              key={`${token}-${index}`}
              role="img"
              aria-label={token}
            >
              <DirectionIcon />
            </span>
          ))}
        </span>
      );
    case "cards":
      return (
        <span className="card-sequence">
          {sequence.map((token, index) => {
            const card = parseCard(token);

            return (
              <span
                className={card.red ? "playing-card red-card" : "playing-card"}
                key={`${token}-${index}`}
              >
                <span className="card-rank">{card.rank}</span>
                <span className="card-suit">{card.suit}</span>
              </span>
            );
          })}
        </span>
      );
    case "dates":
      return (
        <span className="date-sequence">
          {sequence.map((token, index) => {
            const date = parseDateToken(token);

            return (
              <span className="date-tile" key={`${token}-${index}`}>
                <span className="date-month">{date.month}</span>
                <span className="date-day">{date.day}</span>
                <span className="date-year">{date.year}</span>
              </span>
            );
          })}
        </span>
      );
  }
}

function makePuzzle(item: CorpusItem): Puzzle {
  const randomOptions = Array.from({ length: optionCount - 1 }, (_, index) => ({
    id: `random-${index}`,
    source: "random" as const,
    sequence: makeRandomSequence(item.categoryId, item.sequence.length),
  }));

  return {
    id: `${item.id}-${makePuzzleId()}`,
    item,
    options: shuffle([
      {
        id: "ai",
        source: "ai" as const,
        sequence: item.sequence,
      },
      ...randomOptions,
    ]),
  };
}

function makePuzzleFromSharedProblem({
  code,
  problem,
}: SharedProblemState): Puzzle {
  const category = categoryById[problem.c];
  const fallbackItem =
    allItems.find((item) => item.categoryId === problem.c) ?? allItems[0];

  return {
    id: `shared-${code}`,
    item: {
      ...fallbackItem,
      id: `shared-${code}`,
      categoryId: problem.c,
      categoryLabel: category.label,
      generationNumber: 0,
      sequence: problem.o[problem.a],
    },
    options: problem.o.map((sequence, index) => ({
      id: `shared-${index}`,
      source: index === problem.a ? "ai" : "random",
      sequence,
    })),
  };
}

function makeProblemFromPuzzle(puzzle: Puzzle): SharedProblem | null {
  const answerIndex = puzzle.options.findIndex(
    (option) => option.source === "ai",
  );

  if (answerIndex < 0) {
    return null;
  }

  return {
    v: 1,
    c: puzzle.item.categoryId,
    o: puzzle.options.map((option) => option.sequence),
    a: answerIndex,
  };
}

function makeShareUrl(puzzle: Puzzle) {
  if (typeof window === "undefined") {
    return null;
  }

  const problem = makeProblemFromPuzzle(puzzle);

  if (!problem) {
    return null;
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("problem", encodeProblem(problem));

  return url.toString();
}

function readSharedProblemFromLocation(): SharedProblemState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const code = new URLSearchParams(window.location.search).get("problem");
  const problem = decodeProblem(code);

  if (!code || !problem) {
    return null;
  }

  return { code, problem };
}

function clearProblemFromLocation() {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(null, "", "/");
}

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fall through to the textarea copy path.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  } catch {
    // Ignore copy failures; the game should remain playable.
  }
}

function optionClassName(
  option: SequenceOption,
  selectedOptionId: string | null,
) {
  if (!selectedOptionId) {
    return "option-card";
  }

  if (option.source === "ai") {
    return "option-card reveal-ai";
  }

  if (option.id === selectedOptionId) {
    return "option-card reveal-wrong";
  }

  return "option-card dimmed";
}

function safeColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#E5E7EB";
}

function colorCodeStyle(value: string) {
  const lightBackground = hexLuminance(value) > 0.58;

  return {
    color: lightBackground ? "#111111" : "#ffffff",
  };
}

function hexLuminance(value: string) {
  const red = Number.parseInt(value.slice(1, 3), 16) / 255;
  const green = Number.parseInt(value.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(value.slice(5, 7), 16) / 255;

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function makeDefaultStatsByCategory(): StatsByCategory {
  return Object.fromEntries(
    categoryFilters.map((category) => [category, { ...defaultStats }]),
  ) as StatsByCategory;
}

function readStoredStatsByCategory() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(statsStorageKey);

    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as unknown;
    const legacyStats = normalizeStoredStats(parsed);

    if (legacyStats) {
      return {
        ...makeDefaultStatsByCategory(),
        all: legacyStats,
      };
    }

    return normalizeStoredStatsByCategory(parsed);
  } catch {
    return null;
  }
}

function normalizeStoredStatsByCategory(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const stored = value as Record<string, unknown>;
  const nextStatsByCategory = makeDefaultStatsByCategory();
  let hasStoredMode = false;

  for (const category of categoryFilters) {
    const categoryStats = normalizeStoredStats(stored[category]);

    if (categoryStats) {
      nextStatsByCategory[category] = categoryStats;
      hasStoredMode = true;
    }
  }

  return hasStoredMode ? nextStatsByCategory : null;
}

function normalizeStoredStats(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const stats = value as Record<string, unknown>;
  const { bestStreak, correct, played, streak } = stats;

  if (
    typeof played !== "number" ||
    typeof correct !== "number" ||
    typeof streak !== "number" ||
    typeof bestStreak !== "number" ||
    !Number.isInteger(played) ||
    !Number.isInteger(correct) ||
    !Number.isInteger(streak) ||
    !Number.isInteger(bestStreak)
  ) {
    return null;
  }

  return {
    played: Math.max(0, played),
    correct: Math.max(0, correct),
    streak: Math.max(0, streak),
    bestStreak: Math.max(0, bestStreak),
  };
}

function readStoredGuide() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(guideStorageKey);

    if (value === null) {
      return null;
    }

    return value === "true";
  } catch {
    return null;
  }
}

function readStoredCategoryFilter() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeCategoryFilter(
      window.localStorage.getItem(lastCategoryStorageKey),
    );
  } catch {
    return null;
  }
}

function normalizeCategoryFilter(value: unknown): CategoryFilter | null {
  return typeof value === "string" &&
    categoryFilters.includes(value as CategoryFilter)
    ? (value as CategoryFilter)
    : null;
}

function writeStorage(
  key: string,
  value: boolean | CategoryFilter | StatsByCategory,
) {
  try {
    const storedValue =
      typeof value === "string" ? value : String(JSON.stringify(value));

    window.localStorage.setItem(key, storedValue);
  } catch {
    // Ignore storage failures; the game should remain playable.
  }
}

function makePuzzleId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  );
}

function DirectionIcon() {
  return (
    <svg
      aria-hidden="true"
      className="direction-arrow"
      focusable="false"
      viewBox="0 0 64 64"
    >
      <path d={directionArrowPath} fill="currentColor" />
    </svg>
  );
}

function directionClassName(direction: string) {
  switch (direction) {
    case "Up":
      return "direction-up";
    case "Down":
      return "direction-down";
    case "Left":
      return "direction-left";
    default:
      return "direction-right";
  }
}

function parseCard(token: string) {
  const suitCode = token.slice(-1);
  const rank = token.slice(0, -1);
  const suits: Record<string, string> = {
    C: "♣",
    D: "♦",
    H: "♥",
    S: "♠",
  };

  return {
    rank,
    suit: suits[suitCode] ?? suitCode,
    red: suitCode === "D" || suitCode === "H",
  };
}

function parseDateToken(token: string) {
  const [year = "", month = "", day = ""] = token.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthIndex = Number(month) - 1;

  return {
    month: monthNames[monthIndex] ?? month,
    day: day.replace(/^0/, ""),
    year,
  };
}
