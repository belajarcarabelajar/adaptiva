import { describe, it, expect } from "vitest";
import { ACTION_POINT_COSTS } from "../../../../functions/api/gemini/[[path]]";

describe("Point costs system mapping", () => {
  it("defines point costs for all action headers sent by frontend", () => {
    expect(ACTION_POINT_COSTS["curriculum"]).toBe(20);
    expect(ACTION_POINT_COSTS["module"]).toBe(5);
    expect(ACTION_POINT_COSTS["quiz"]).toBe(10);
    expect(ACTION_POINT_COSTS["exam"]).toBe(15);
    expect(ACTION_POINT_COSTS["flashcard"]).toBe(5);
    expect(ACTION_POINT_COSTS["tutor"]).toBe(2);
  });
});
