import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createShikiHighlighter } from "./createShikiHighlighter";

describe("createShikiHighlighter", () => {
  it("renders plain code before highlighting resolves", () => {
    const codeToHtml = vi.fn(() => new Promise<string>(() => {}));
    const Highlighter = createShikiHighlighter(codeToHtml);
    render(<Highlighter code="const a = 1;" language="js" />);
    expect(screen.getByText("const a = 1;")).toHaveClass("llm-code-plain");
  });

  it("renders the highlighted html once the promise resolves", async () => {
    const codeToHtml = vi
      .fn()
      .mockResolvedValue("<pre class='shiki'>highlighted</pre>");
    const Highlighter = createShikiHighlighter(codeToHtml);
    const { container } = render(
      <Highlighter code="const a = 1;" language="js" />,
    );
    await waitFor(() => {
      expect(container.querySelector(".llm-shiki")).toBeInTheDocument();
    });
    expect(container.querySelector(".llm-shiki")?.innerHTML).toContain(
      "highlighted",
    );
    expect(codeToHtml).toHaveBeenCalledWith("const a = 1;", {
      lang: "js",
      themes: { light: "github-light", dark: "github-dark" },
    });
  });

  it("supports a synchronous codeToHtml (core-style highlighter)", async () => {
    const codeToHtml = vi.fn(() => "<pre class='shiki'>sync</pre>");
    const Highlighter = createShikiHighlighter(codeToHtml);
    const { container } = render(<Highlighter code="x" language="ts" />);
    await waitFor(() => {
      expect(container.querySelector(".llm-shiki")?.innerHTML).toContain("sync");
    });
  });

  it("forwards custom themes to codeToHtml", async () => {
    const codeToHtml = vi.fn().mockResolvedValue("<pre>x</pre>");
    const Highlighter = createShikiHighlighter(codeToHtml, {
      themes: { light: "vitesse-light", dark: "vitesse-dark" },
    });
    render(<Highlighter code="x" language="ts" />);
    await waitFor(() => {
      expect(codeToHtml).toHaveBeenCalledWith("x", {
        lang: "ts",
        themes: { light: "vitesse-light", dark: "vitesse-dark" },
      });
    });
  });

  it("falls back to plain code when highlighting fails", async () => {
    const codeToHtml = vi.fn().mockRejectedValue(new Error("unknown language"));
    const Highlighter = createShikiHighlighter(codeToHtml);
    render(<Highlighter code="some code" language="nope" />);
    await waitFor(() => {
      expect(screen.getByText("some code")).toHaveClass("llm-code-plain");
    });
  });
});
