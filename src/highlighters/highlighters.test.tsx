import { describe, expect, it } from "vitest";

import { ShikiHighlighter } from "./shiki";
import { ShikiWebHighlighter } from "./shikiWeb";

describe("pre-baked highlighters", () => {
  it("exports the full-bundle highlighter as a component", () => {
    expect(typeof ShikiHighlighter).toBe("function");
  });

  it("exports the web-bundle highlighter as a component", () => {
    expect(typeof ShikiWebHighlighter).toBe("function");
  });
});
