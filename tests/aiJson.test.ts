import { describe, it, expect } from "vitest";
import { cleanAiJson } from "../api/lib/aiJson.js";

describe("AI JSON cleaning", () => {
  it("preserves URLs and comment-like text inside string values", () => {
    const input = '[{"title":"t","description":"see https://example.com/a // b"}]';
    let parsed: any;
    expect(() => { parsed = JSON.parse(cleanAiJson(input)); }).not.toThrow();
    expect(parsed[0].description).toBe("see https://example.com/a // b");
  });

  it("strips line comments outside strings", () => {
    const input = '[{"a":1} // note\n]';
    expect(JSON.parse(cleanAiJson(input))).toEqual([{ a: 1 }]);
  });

  it("removes trailing commas outside strings", () => {
    const input = '[{"a":"x, y",},]';
    expect(JSON.parse(cleanAiJson(input))).toEqual([{ a: "x, y" }]);
  });
});