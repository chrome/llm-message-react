import { describe, expect, it } from "vitest";

import { escapeBrackets, escapeMhchem, preprocessLaTeX } from "./preprocess";

describe("escapeBrackets", () => {
  it("converts \\[ ... \\] display math to $$ ... $$", () => {
    expect(escapeBrackets("\\[a + b\\]")).toBe("$$a + b$$");
  });

  it("converts \\( ... \\) inline math to $ ... $", () => {
    expect(escapeBrackets("\\(x^2\\)")).toBe("$x^2$");
  });

  it("handles multiline display math", () => {
    expect(escapeBrackets("\\[\na = b\n\\]")).toBe("$$\na = b\n$$");
  });

  it("converts an empty display-math block", () => {
    expect(escapeBrackets("\\[\\]")).toBe("$$$$");
  });

  it("leaves code blocks untouched", () => {
    const input = "```\n\\[a\\]\n```";
    expect(escapeBrackets(input)).toBe(input);
  });

  it("leaves inline code untouched", () => {
    const input = "`\\(x\\)`";
    expect(escapeBrackets(input)).toBe(input);
  });

  it("returns text without brackets unchanged", () => {
    expect(escapeBrackets("plain text")).toBe("plain text");
  });
});

describe("escapeMhchem", () => {
  it("escapes \\ce command", () => {
    expect(escapeMhchem("$\\ce{H2O}$")).toBe("$\\\\ce{H2O}$");
  });

  it("escapes \\pu command", () => {
    expect(escapeMhchem("$\\pu{123 kJ}$")).toBe("$\\\\pu{123 kJ}$");
  });

  it("escapes multiple occurrences", () => {
    expect(escapeMhchem("$\\ce{A}$ and $\\ce{B}$")).toBe(
      "$\\\\ce{A}$ and $\\\\ce{B}$",
    );
  });

  it("leaves unrelated text unchanged", () => {
    expect(escapeMhchem("no chemistry here")).toBe("no chemistry here");
  });
});

describe("preprocessLaTeX", () => {
  it("escapes a dollar sign used as currency", () => {
    expect(preprocessLaTeX("It costs $5 today")).toBe("It costs \\$5 today");
  });

  it("does not escape currency inside existing $$ math", () => {
    expect(preprocessLaTeX("$$x = 5$$")).toBe("$$x = 5$$");
  });

  it("does not touch currency inside code blocks", () => {
    const input = "`price = $5`";
    expect(preprocessLaTeX(input)).toBe("`price = $5`");
  });

  it("does not touch currency inside fenced code blocks", () => {
    const input = "```\ncost $5\n```";
    expect(preprocessLaTeX(input)).toBe(input);
  });

  it("converts \\[ \\] delimiters to $$ $$", () => {
    expect(preprocessLaTeX("\\[E = mc^2\\]")).toBe("$$E = mc^2$$");
  });

  it("converts \\( \\) delimiters to $ $", () => {
    expect(preprocessLaTeX("\\(a+b\\)")).toBe("$a+b$");
  });

  it("preserves existing \\( \\) math during currency escaping", () => {
    expect(preprocessLaTeX("\\(x = 5\\)")).toBe("$x = 5$");
  });

  it("applies mhchem escaping at the end", () => {
    expect(preprocessLaTeX("$\\ce{H2O}$")).toBe("$\\\\ce{H2O}$");
  });

  it("handles a combination of currency and math", () => {
    expect(preprocessLaTeX("Pay $10 for \\(x\\)")).toBe("Pay \\$10 for $x$");
  });

  it("does not escape single-dollar math that begins with a digit", () => {
    expect(preprocessLaTeX("total $15 \\text{ g}$ of fat")).toBe(
      "total $15 \\text{ g}$ of fat",
    );
  });

  it("keeps multiple inline math spans on one line intact", () => {
    const input =
      "about $\\mathbf{135 \\text{ kcal}}$ and only $15 \\text{ g}$ of fat";
    expect(preprocessLaTeX(input)).toBe(input);
  });

  it("still escapes currency next to digit-leading inline math", () => {
    expect(preprocessLaTeX("Pay $10 then $2 \\text{ g}$ left")).toBe(
      "Pay \\$10 then $2 \\text{ g}$ left",
    );
  });

  it("does not half-escape a balanced numeric single-dollar span", () => {
    expect(preprocessLaTeX("Углеводы: $0$ г")).toBe("Углеводы: $0$ г");
  });

  it("keeps numeric and command spans intact across lines", () => {
    const input =
      "**Белки:** $0$ г\n**Жиры:** $\\mathbf{15}$ г\n**Углеводы:** $0$ г";
    expect(preprocessLaTeX(input)).toBe(input);
  });

  it("protects a numeric span with operators", () => {
    expect(preprocessLaTeX("$1288 / 3$ porции")).toBe("$1288 / 3$ porции");
  });

  it("still escapes currency that is not a balanced math pair", () => {
    expect(preprocessLaTeX("Cost $5 plus $3 total")).toBe(
      "Cost \\$5 plus \\$3 total",
    );
  });

  it("returns plain text unchanged", () => {
    expect(preprocessLaTeX("just some words")).toBe("just some words");
  });
});
