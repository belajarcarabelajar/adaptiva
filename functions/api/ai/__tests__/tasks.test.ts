import { describe, it, expect } from "bun:test";
import { ACTION_POINT_COSTS, resolveTask } from "../_tasks";

const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-5-5";

// Spec 2.1 table, owner-approved mapping.
const EXPECTED: Record<
  string,
  { action: string; model: string; effort: string; maxTokens: number; kind: string }
> = {
  "curriculum.outline": { action: "curriculum", model: SONNET, effort: "medium", maxTokens: 16384, kind: "json" },
  "curriculum.sevenDayPlan": { action: "curriculum", model: SONNET, effort: "medium", maxTokens: 16384, kind: "json" },
  "module.summary": { action: "module", model: SONNET, effort: "medium", maxTokens: 32768, kind: "json" },
  "exam.questions": { action: "exam", model: SONNET, effort: "medium", maxTokens: 32768, kind: "json" },
  "resources.search": { action: "default", model: SONNET, effort: "medium", maxTokens: 16384, kind: "search" },
  "quiz.questions": { action: "quiz", model: HAIKU, effort: "medium", maxTokens: 16384, kind: "json" },
  "quiz.explanation": { action: "quiz", model: HAIKU, effort: "medium", maxTokens: 16384, kind: "json" },
  "flashcard.cards": { action: "flashcard", model: HAIKU, effort: "low", maxTokens: 16384, kind: "json" },
  "tutor.chat": { action: "tutor", model: HAIKU, effort: "low", maxTokens: 8192, kind: "stream" },
};

const JSON_TASKS = Object.keys(EXPECTED).filter((id) => EXPECTED[id].kind === "json");

function schemaOf(id: string): any {
  const spec = resolveTask(id);
  if (!spec?.schema) throw new Error(`no schema for ${id}`);
  return spec.schema;
}

describe("task registry", () => {
  it("keeps the point costs of the old proxy per action", () => {
    expect(ACTION_POINT_COSTS).toEqual({
      curriculum: 20,
      module: 5,
      quiz: 10,
      exam: 15,
      flashcard: 5,
      tutor: 2,
      default: 5,
    });
  });

  for (const [id, expected] of Object.entries(EXPECTED)) {
    it(`maps ${id} to its action, model, effort, cap and kind`, () => {
      const spec = resolveTask(id);
      expect(spec).not.toBeNull();
      expect({
        action: spec!.action,
        model: spec!.model,
        effort: spec!.effort,
        maxTokens: spec!.maxTokens,
        kind: spec!.kind,
      }).toEqual(expected);
    });
  }

  it("gives every JSON task a schema and no schema to the stream and search tasks", () => {
    for (const id of JSON_TASKS) expect(resolveTask(id)!.schema).toBeDefined();
    expect(resolveTask("tutor.chat")!.schema).toBeUndefined();
    expect(resolveTask("resources.search")!.schema).toBeUndefined();
  });

  it("returns null for unknown ids, including Object.prototype names", () => {
    expect(resolveTask("nope")).toBeNull();
    expect(resolveTask("constructor")).toBeNull();
    expect(resolveTask("__proto__")).toBeNull();
    expect(resolveTask("toString")).toBeNull();
    expect(resolveTask("")).toBeNull();
  });
});

describe("JSON schemas", () => {
  it("curriculum.sevenDayPlan requires day1..day7, each with task and summaryFocus", () => {
    const schema = schemaOf("curriculum.sevenDayPlan");
    const days = ["day1", "day2", "day3", "day4", "day5", "day6", "day7"];
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties).sort()).toEqual(days);
    expect([...schema.required].sort()).toEqual(days);
    for (const day of days) {
      const node = schema.properties[day];
      expect(node.type).toBe("object");
      expect(node.properties.task).toEqual({ type: "string" });
      expect(node.properties.summaryFocus).toEqual({ type: "string" });
      expect([...node.required].sort()).toEqual(["summaryFocus", "task"]);
    }
  });

  it("each JSON task has the field names the web client reads", () => {
    const shape = (id: string) => Object.keys(schemaOf(id).properties).sort();
    expect(shape("curriculum.outline")).toEqual(["moduleTitles", "syllabus"]);
    expect(shape("module.summary")).toEqual(["moduleMaterial"]);
    expect(shape("quiz.explanation")).toEqual(["detailedExplanation"]);
    expect(shape("exam.questions")).toEqual(["questions"]);
    expect(shape("quiz.questions")).toEqual(["questions"]);
    expect(shape("flashcard.cards")).toEqual(["flashcards"]);
    const item = (id: string, key: string) =>
      Object.keys(schemaOf(id).properties[key].items.properties).sort();
    expect(item("exam.questions", "questions")).toEqual([
      "correctAnswer",
      "explanation",
      "options",
      "questionText",
    ]);
    expect(item("quiz.questions", "questions")).toEqual([
      "correctAnswer",
      "explanation",
      "options",
      "question",
    ]);
    expect(item("flashcard.cards", "flashcards")).toEqual(["definition", "term"]);
    expect(schemaOf("curriculum.outline").properties.moduleTitles).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  // Structured outputs reject these keywords with a 400 (docs fetched 2026-11-12).
  const FORBIDDEN = ["maxItems", "minimum", "maximum", "minLength", "maxLength"];

  function walk(node: any, path: string, visit: (node: any, path: string) => void) {
    if (node === null || typeof node !== "object") return;
    visit(node, path);
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, visit));
      return;
    }
    for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`, visit);
  }

  for (const id of JSON_TASKS) {
    it(`${id} has an object root and only supported keywords`, () => {
      const schema = schemaOf(id);
      expect(schema.type).toBe("object");
      const problems: string[] = [];
      walk(schema, id, (node, path) => {
        if (Array.isArray(node)) return;
        for (const key of FORBIDDEN) {
          if (Object.hasOwn(node, key)) problems.push(`${path} has ${key}`);
        }
        if (Object.hasOwn(node, "minItems") && node.minItems > 1) {
          problems.push(`${path} has minItems ${node.minItems}`);
        }
        if (node.type === "object") {
          if (node.additionalProperties !== false) {
            problems.push(`${path} lacks additionalProperties:false`);
          }
          const props = Object.keys(node.properties ?? {}).sort();
          const required = [...(node.required ?? [])].sort();
          if (JSON.stringify(props) !== JSON.stringify(required)) {
            problems.push(`${path} required ${required} != properties ${props}`);
          }
          if (props.length === 0) problems.push(`${path} has no properties`);
        }
      });
      expect(problems).toEqual([]);
    });
  }
});
