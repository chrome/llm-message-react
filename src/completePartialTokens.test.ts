import { describe, expect, it } from "vitest";

import { completePartialTokens } from "./completePartialTokens";

describe("completePartialTokens", () => {
  describe("edge cases", () => {
    it("returns an empty string unchanged", () => {
      expect(completePartialTokens("")).toBe("");
    });

    it("leaves already-complete text untouched", () => {
      const input = "Hello **world** and `code` and [link](http://x).";
      expect(completePartialTokens(input)).toBe(input);
    });
  });

  describe("emphasis", () => {
    it("closes a dangling bold marker", () => {
      expect(completePartialTokens("**bold")).toBe("**bold**");
    });

    it("closes a dangling italic marker", () => {
      expect(completePartialTokens("*italic")).toBe("*italic*");
    });

    it("closes a dangling strikethrough marker", () => {
      expect(completePartialTokens("~~strike")).toBe("~~strike~~");
    });

    it("balances a triple-asterisk opener", () => {
      expect(completePartialTokens("***bolditalic")).toBe("***bolditalic***");
    });

    it("does not treat a bullet marker as emphasis", () => {
      expect(completePartialTokens("* item")).toBe("* item");
    });

    it("closes bold inside a list item without the bullet skewing parity", () => {
      expect(completePartialTokens("* **Bold item")).toBe("* **Bold item**");
    });

    it("closes bold in a list item when a thematic break precedes it", () => {
      expect(completePartialTokens("***\n\n*   **Bold item")).toBe(
        "***\n\n*   **Bold item**",
      );
    });

    it("does not treat multiplication as emphasis", () => {
      expect(completePartialTokens("2 * 3")).toBe("2 * 3");
    });

    it("leaves balanced bold untouched", () => {
      expect(completePartialTokens("**bold**")).toBe("**bold**");
    });

    it("closes bold before a trailing space", () => {
      expect(completePartialTokens("**Bold ")).toBe("**Bold** ");
    });

    it("closes italic before a trailing space", () => {
      expect(completePartialTokens("*italic ")).toBe("*italic* ");
    });

    it("closes strikethrough before a trailing space", () => {
      expect(completePartialTokens("~~strike ")).toBe("~~strike~~ ");
    });

    it("closes a dangling underscore italic marker", () => {
      expect(completePartialTokens("_italic")).toBe("_italic_");
    });

    it("closes a dangling underscore bold marker", () => {
      expect(completePartialTokens("__bold")).toBe("__bold__");
    });

    it("closes underscore italic before a trailing space", () => {
      expect(completePartialTokens("an _italic ")).toBe("an _italic_ ");
    });

    it("does not treat snake_case as underscore emphasis", () => {
      expect(completePartialTokens("call snake_case")).toBe("call snake_case");
    });

    it("does not treat a dunder name as underscore emphasis", () => {
      expect(completePartialTokens("def __init__")).toBe("def __init__");
    });

    it("closes an underscore italic opened after punctuation", () => {
      expect(completePartialTokens("(_italic")).toBe("(_italic_");
    });

    it("leaves balanced underscore emphasis untouched", () => {
      expect(completePartialTokens("_italic_ and __bold__")).toBe(
        "_italic_ and __bold__",
      );
    });
  });

  describe("dangling list markers", () => {
    it("hides a lone dash under a paragraph (setext heading)", () => {
      expect(completePartialTokens("Unordered list:\n-")).toBe(
        "Unordered list:",
      );
    });

    it("hides a dash-and-space under a paragraph", () => {
      expect(completePartialTokens("Unordered list:\n- ")).toBe(
        "Unordered list:",
      );
    });

    it("keeps a list item once it has content", () => {
      expect(completePartialTokens("Unordered list:\n- Item A")).toBe(
        "Unordered list:\n- Item A",
      );
    });

    it("keeps a thematic break separated by a blank line", () => {
      expect(completePartialTokens("Some text\n\n---")).toBe("Some text\n\n---");
    });
  });

  describe("tables", () => {
    it("completes a delimiter row that just started", () => {
      expect(
        completePartialTokens("| Feature | Works |\n| ---"),
      ).toBe("| Feature | Works |\n| --- | --- |");
    });

    it("completes a partially streamed delimiter row", () => {
      expect(
        completePartialTokens("| A | B | C |\n| --- | --"),
      ).toBe("| A | B | C |\n| --- | --- | --- |");
    });

    it("preserves alignment colons", () => {
      expect(completePartialTokens("| A | B |\n| :--- | --:")).toBe(
        "| A | B |\n| :--- | ---: |",
      );
    });

    it("leaves a complete table untouched", () => {
      const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
      expect(completePartialTokens(input)).toBe(input);
    });

    it("does not rewrite a complete table whose last row is dash-only", () => {
      const input = "| A | B |\n| --- | --- |\n| - | - |";
      expect(completePartialTokens(input)).toBe(input);
    });

    it("ignores a dash line when the row above has no pipes", () => {
      expect(completePartialTokens("Heading\n---")).toBe("Heading");
    });
  });

  describe("inline code", () => {
    it("closes a dangling inline code span", () => {
      expect(completePartialTokens("here is `code")).toBe("here is `code`");
    });

    it("leaves a complete inline code span untouched", () => {
      expect(completePartialTokens("here is `code`")).toBe("here is `code`");
    });

    it("does not treat markdown inside inline code as tokens", () => {
      expect(completePartialTokens("`**not bold`")).toBe("`**not bold`");
    });

    it("leaves a double-backtick span containing a backtick untouched", () => {
      expect(completePartialTokens("here is ``a`b`` done")).toBe(
        "here is ``a`b`` done",
      );
    });

    it("bounds an unterminated inline code span to its own line", () => {
      expect(completePartialTokens("a `code\n**bold")).toBe(
        "a `code`\n**bold**",
      );
    });
  });

  describe("code fences", () => {
    it("leaves an unclosed fenced code block as-is", () => {
      const input = "```js\nconst x = **y";
      expect(completePartialTokens(input)).toBe(input);
    });

    it("does not alter markdown inside a complete fenced block", () => {
      const input = "```\n**not bold**\n```";
      expect(completePartialTokens(input)).toBe(input);
    });
  });

  describe("links", () => {
    it("hides an incomplete link label", () => {
      expect(completePartialTokens("see [lab")).toBe("see ");
    });

    it("hides an incomplete image label", () => {
      expect(completePartialTokens("see ![al")).toBe("see ");
    });

    it("hides a link with an open destination", () => {
      expect(completePartialTokens("see [label](http")).toBe("see ");
    });

    it("keeps a complete link", () => {
      expect(completePartialTokens("see [label](http://x)")).toBe(
        "see [label](http://x)",
      );
    });

    it("keeps a closed bracket fragment like array indexing", () => {
      expect(completePartialTokens("arr[i] = 1")).toBe("arr[i] = 1");
    });
  });

  describe("math", () => {
    it("progressively closes incomplete inline math with $", () => {
      expect(completePartialTokens("equation $E = mc^2")).toBe(
        "equation $E = mc^2$",
      );
    });

    it("progressively closes incomplete \\( inline math", () => {
      expect(completePartialTokens("see \\(a + b")).toBe("see \\(a + b\\)");
    });

    it("closes a complete-bodied inline span and appends $", () => {
      expect(completePartialTokens("$\\approx 152 \\text{ kcal}")).toBe(
        "$\\approx 152 \\text{ kcal}$",
      );
    });

    it("drops an incomplete trailing brace group in inline math", () => {
      expect(completePartialTokens("$\\approx 152 \\text{ kc")).toBe(
        "$\\approx 152$",
      );
    });

    it("keeps complete inline math", () => {
      expect(completePartialTokens("eq $x$ done")).toBe("eq $x$ done");
    });

    it("keeps complete display math", () => {
      expect(completePartialTokens("eq $$x$$ done")).toBe("eq $$x$$ done");
    });

    it("does not treat currency as math", () => {
      expect(completePartialTokens("It costs $5")).toBe("It costs $5");
    });

    it("treats a digit-leading inline span with a command as math, not currency", () => {
      expect(completePartialTokens("**Kcal:** $1288 \\text{ kcal}")).toBe(
        "**Kcal:** $1288 \\text{ kcal}$",
      );
    });

    it("keeps a completed digit-leading inline span with a command intact", () => {
      const input = "**Kcal:** $1288 \\text{ kcal} / 3 \\approx \\mathbf{430}$ kcal";
      expect(completePartialTokens(input)).toBe(input);
    });

    it("still treats a digit-leading span without a command as currency", () => {
      expect(completePartialTokens("It costs $1288 dollars")).toBe(
        "It costs $1288 dollars",
      );
    });

    it("keeps complete inline math whose content begins with a digit", () => {
      const input = "total $15 \\text{ g}$ of fat, plus $(\\approx 40)$.";
      expect(completePartialTokens(input)).toBe(input);
    });

    it("does not hide trailing text after digit-leading inline math", () => {
      const input =
        "about $\\mathbf{135}$ and $15 \\text{ g}$ of fat **bold** tail.";
      expect(completePartialTokens(input)).toBe(input);
    });

    it("does not treat an escaped dollar as math", () => {
      expect(completePartialTokens("price \\$ here")).toBe("price \\$ here");
    });

    it("does not hide trailing text after a balanced numeric span", () => {
      const input = "Carbs: $0$ g\nand more text after.";
      expect(completePartialTokens(input)).toBe(input);
    });

    it("keeps an odd number of command-free numeric spans intact", () => {
      const input =
        "**Protein:** $0$ g\n**Fat:** $\\mathbf{15}$ g\n**Carbs:** $0$ g\n**Kcal:** $\\mathbf{135}$ kcal\nTotal.";
      expect(completePartialTokens(input)).toBe(input);
    });
  });

  describe("progressive block math", () => {
    it("renders the valid prefix of incomplete \\[ display math", () => {
      expect(completePartialTokens("see \\[a + b")).toBe("see \\[a + b\\]");
    });

    it("renders the valid prefix of incomplete $$ display math", () => {
      expect(completePartialTokens("see $$x = y")).toBe("see $$x = y$$");
    });

    it("drops a trailing in-progress command so KaTeX does not error", () => {
      expect(completePartialTokens("\\[E = mc^2 + \\fra")).toBe(
        "\\[E = mc^2 +\\]",
      );
    });

    it("balances an open fraction group", () => {
      expect(completePartialTokens("\\[\\frac{\\rho}{\\varepsilon_0")).toBe(
        "\\[\\frac{\\rho}{\\varepsilon_0}\\]",
      );
    });

    it("closes an open aligned environment, revealing complete rows", () => {
      const input =
        "\\[\n\\begin{aligned}\n\\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\\n\\nabla \\cdot \\vec{B} &= 0 \\\\\n\\nabla \\times \\vec{E}";
      expect(completePartialTokens(input)).toBe(
        "\\[\n\\begin{aligned}\n\\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\\n\\nabla \\cdot \\vec{B} &= 0 \\\\\\end{aligned}\n\\]",
      );
    });

    it("renders a fully streamed aligned block once \\end has arrived", () => {
      const input =
        "\\[\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}";
      expect(completePartialTokens(input)).toBe(
        "\\[\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n\\]",
      );
    });

    it("hides a block that has no renderable content yet", () => {
      expect(completePartialTokens("text \\[\n\\begin{aligned}")).toBe("text ");
    });

    it("leaves complete display math untouched", () => {
      expect(completePartialTokens("\\[a + b\\]")).toBe("\\[a + b\\]");
    });

    it("hides an unfinished \\[ block when progressive rendering is off", () => {
      expect(
        completePartialTokens("see \\[a + b", {
          showUnfinishedLatexBlocks: false,
        }),
      ).toBe("see ");
    });

    it("hides an unfinished $$ block when progressive rendering is off", () => {
      expect(
        completePartialTokens("see $$x = y", {
          showUnfinishedLatexBlocks: false,
        }),
      ).toBe("see ");
    });

    it("still completes finished display math when progressive rendering is off", () => {
      expect(
        completePartialTokens("\\[a + b\\]", {
          showUnfinishedLatexBlocks: false,
        }),
      ).toBe("\\[a + b\\]");
    });

    it("hides unfinished inline $ math when progressive rendering is off", () => {
      expect(
        completePartialTokens("equation $E = mc^2", {
          showUnfinishedLatexBlocks: false,
        }),
      ).toBe("equation ");
    });

    it("hides unfinished inline \\( math when progressive rendering is off", () => {
      expect(
        completePartialTokens("see \\(a + b", {
          showUnfinishedLatexBlocks: false,
        }),
      ).toBe("see ");
    });
  });
});
