import katex from "katex";
import { describe, expect, it } from "vitest";

/**
 * `completePartialTokens` validates streamed math with KaTeX's public
 * `renderToString` + `throwOnError` API. These tests lock that contract down so
 * a KaTeX upgrade that changes or removes it fails CI instead of silently
 * disabling progressive block-math rendering.
 */
describe("katex public API contract", () => {
  it("exposes renderToString as a function", () => {
    expect(typeof katex.renderToString).toBe("function");
  });

  it("throws on invalid input when throwOnError is true", () => {
    expect(() =>
      katex.renderToString("\\frac{", { throwOnError: true, strict: false }),
    ).toThrow();
  });

  it("renders valid input without throwing", () => {
    expect(() =>
      katex.renderToString("a + b", { throwOnError: true, strict: false }),
    ).not.toThrow();
  });

  it("accepts displayMode for block math validation", () => {
    expect(() =>
      katex.renderToString("\\begin{aligned} a &= b \\end{aligned}", {
        displayMode: true,
        throwOnError: true,
        strict: false,
      }),
    ).not.toThrow();
  });
});
