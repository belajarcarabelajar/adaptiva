// Server-side registry for /api/ai. The client sends only a task id; the
// model, effort, output cap and JSON schema are chosen here so a cheap action
// can never buy a more expensive generation.

export type TaskId =
  | "curriculum.outline"
  | "curriculum.sevenDayPlan"
  | "module.summary"
  | "exam.questions"
  | "resources.search"
  | "quiz.questions"
  | "quiz.explanation"
  | "flashcard.cards"
  | "tutor.chat";

export type ClaudeModel = "claude-sonnet-5-5" | "claude-haiku-5-5";

export type TaskKind = "json" | "stream" | "search";

export type JsonSchema = Record<string, unknown>;

export interface TaskSpec {
  id: TaskId;
  action: keyof typeof ACTION_POINT_COSTS;
  model: ClaudeModel;
  effort: "low" | "medium";
  maxTokens: number;
  kind: TaskKind;
  schema?: JsonSchema;
}

export const ACTION_POINT_COSTS = {
  curriculum: 20,
  module: 5,
  quiz: 10,
  exam: 15,
  flashcard: 5,
  tutor: 2,
  default: 5,
} as const satisfies Record<string, number>;

const SONNET: ClaudeModel = "claude-sonnet-5-5";
const HAIKU: ClaudeModel = "claude-haiku-5-5";

const STRING = { type: "string" } as const;

// Structured outputs reject maxItems, minItems above 1, and numeric or length
// bounds with a 400, so every schema here uses only object, array and string.
function object(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function arrayOf(items: JsonSchema): JsonSchema {
  return { type: "array", items };
}

const DAY = object({ task: STRING, summaryFocus: STRING });

const TASKS: Record<TaskId, TaskSpec> = {
  "curriculum.outline": {
    id: "curriculum.outline",
    action: "curriculum",
    model: SONNET,
    effort: "medium",
    maxTokens: 16384,
    kind: "json",
    schema: object({ syllabus: STRING, moduleTitles: arrayOf(STRING) }),
  },
  // Seven named properties instead of an array guarantee exactly seven days
  // without the unsupported minItems/maxItems.
  "curriculum.sevenDayPlan": {
    id: "curriculum.sevenDayPlan",
    action: "curriculum",
    model: SONNET,
    effort: "medium",
    maxTokens: 16384,
    kind: "json",
    schema: object({
      day1: DAY,
      day2: DAY,
      day3: DAY,
      day4: DAY,
      day5: DAY,
      day6: DAY,
      day7: DAY,
    }),
  },
  "module.summary": {
    id: "module.summary",
    action: "module",
    model: SONNET,
    effort: "medium",
    maxTokens: 32768,
    kind: "json",
    schema: object({ moduleMaterial: STRING }),
  },
  "exam.questions": {
    id: "exam.questions",
    action: "exam",
    model: SONNET,
    effort: "medium",
    maxTokens: 32768,
    kind: "json",
    schema: object({
      questions: arrayOf(
        object({
          questionText: STRING,
          options: arrayOf(STRING),
          correctAnswer: STRING,
          explanation: STRING,
        }),
      ),
    }),
  },
  "resources.search": {
    id: "resources.search",
    action: "default",
    model: SONNET,
    effort: "medium",
    maxTokens: 16384,
    kind: "search",
  },
  "quiz.questions": {
    id: "quiz.questions",
    action: "quiz",
    model: HAIKU,
    effort: "medium",
    maxTokens: 16384,
    kind: "json",
    schema: object({
      questions: arrayOf(
        object({
          question: STRING,
          options: arrayOf(STRING),
          correctAnswer: STRING,
          explanation: STRING,
        }),
      ),
    }),
  },
  "quiz.explanation": {
    id: "quiz.explanation",
    action: "quiz",
    model: HAIKU,
    effort: "medium",
    maxTokens: 16384,
    kind: "json",
    schema: object({ detailedExplanation: STRING }),
  },
  "flashcard.cards": {
    id: "flashcard.cards",
    action: "flashcard",
    model: HAIKU,
    effort: "low",
    maxTokens: 16384,
    kind: "json",
    schema: object({ flashcards: arrayOf(object({ term: STRING, definition: STRING })) }),
  },
  "tutor.chat": {
    id: "tutor.chat",
    action: "tutor",
    model: HAIKU,
    effort: "low",
    maxTokens: 8192,
    kind: "stream",
  },
};

// Own-property lookup: a plain lookup would resolve "constructor" and other
// Object.prototype names to functions.
export function resolveTask(id: string): TaskSpec | null {
  return Object.hasOwn(TASKS, id) ? TASKS[id as TaskId] : null;
}
