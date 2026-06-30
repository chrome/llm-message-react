import { describe, expect, it } from "vitest";

import { splitMarkdownBlocks } from "./splitBlocks";

describe("splitMarkdownBlocks", () => {
  it("returns no blocks for empty or whitespace-only input", () => {
    expect(splitMarkdownBlocks("")).toEqual([]);
    expect(splitMarkdownBlocks("   \n  \n")).toEqual([]);
  });

  it("keeps a single paragraph as one block", () => {
    expect(splitMarkdownBlocks("Hello world")).toEqual(["Hello world"]);
  });

  it("returns a single block without a blank-line separator", () => {
    // A long code fence with no blank lines is the common single-growing-block
    // case; it must not be split (and is short-circuited before the parse).
    const source = "```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("does not split constructs that lack a blank-line separator", () => {
    // A heading immediately followed by a paragraph renders identically whether
    // split or not, so it is kept whole to avoid a parse on every chunk.
    const source = "# Title\nImmediately following paragraph.";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("splits consecutive paragraphs into separate blocks", () => {
    const source = "First paragraph\n\nSecond paragraph";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks.join("")).toBe(source);
    expect(blocks[1]).toContain("Second paragraph");
  });

  it("preserves every character so blocks concatenate back to the source", () => {
    const source = "# Title\n\nA paragraph.\n\n- one\n- two\n\nMore text\n";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.join("")).toBe(source);
  });

  it("keeps a fenced code block with internal blank lines in one block", () => {
    const source = "```js\nconst a = 1;\n\nconst b = 2;\n```\n\nafter";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("```js\nconst a = 1;\n\nconst b = 2;\n```\n\n");
    expect(blocks[1]).toBe("after");
  });

  it("keeps a $$ math block with an internal blank line in one block", () => {
    const source = "$$\n\\begin{aligned}\na &= b\n\nc &= d\n\\end{aligned}\n$$";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe(source);
  });

  it("keeps a \\[ \\] math block with an internal blank line in one block", () => {
    const source =
      "\\[\n\\begin{aligned}\na &= b\n\nc &= d\n\\end{aligned}\n\\]";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe(source);
  });

  it("splits a \\[ \\] math block from following prose", () => {
    const source = "\\[\na + b\n\\]\n\nAfter the math.";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks.join("")).toBe(source);
    expect(blocks[1]).toBe("After the math.");
  });

  it("keeps a loose list (blank lines between items) as one block", () => {
    const source = "- one\n\n- two\n\n- three";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe(source);
  });

  it("keeps a table as one block", () => {
    const source = "| a | b |\n| - | - |\n| 1 | 2 |\n\nnext";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("| a | b |");
    expect(blocks[1]).toBe("next");
  });

  it("keeps earlier blocks byte-identical as the last block grows", () => {
    const head = "# Title\n\nStable paragraph.\n\n";
    const before = splitMarkdownBlocks(`${head}Streaming ta`);
    const after = splitMarkdownBlocks(`${head}Streaming tail is longer now`);
    expect(before.slice(0, -1)).toEqual(after.slice(0, -1));
    expect(before[before.length - 1]).toBe("Streaming ta");
    expect(after[after.length - 1]).toBe("Streaming tail is longer now");
  });

  it("keeps the block split stable while a list streams token by token", () => {
    // Regression: `marked` normalises the raw of an incomplete trailing list
    // item (`- First ` -> `- First\n`), so concatenating `token.raw` no longer
    // matched the source on those chunks and the whole document collapsed into a
    // single block. With block memoization that flipped the active block between
    // the small list and the entire message on alternating chunks, resetting the
    // smooth-reveal wave and re-fading all earlier text. Splitting from verbatim
    // source slices keeps the block count and earlier blocks stable throughout.
    const source =
      "Intro paragraph one.\n\nIntro paragraph two.\n\n- First item\n- Second item\n- Third item\n\nClosing paragraph.";
    const tokens = source.match(/\s+|\S+/g) ?? [];
    const head = "Intro paragraph one.\n\nIntro paragraph two.\n\n";

    let sawList = false;
    for (let i = 1; i <= tokens.length; i++) {
      const prefix = tokens.slice(0, i).join("");
      const blocks = splitMarkdownBlocks(prefix);
      // Reconstruction must always be exact, on every streamed prefix.
      expect(blocks.join("")).toBe(prefix);
      // Once the list has started but the closing paragraph hasn't, the two
      // intro paragraphs stay as their own stable leading blocks (no collapse
      // into one giant block).
      if (prefix.startsWith(`${head}-`) && !prefix.includes("Closing")) {
        sawList = true;
        expect(blocks.length).toBeGreaterThanOrEqual(3);
        expect(blocks[0]).toBe("Intro paragraph one.\n\n");
        expect(blocks[1]).toBe("Intro paragraph two.\n\n");
      }
    }
    expect(sawList).toBe(true);
  });

  it("returns a single block when footnotes are present", () => {
    const source = "Text with a note[^1]\n\n[^1]: the note";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("returns a single block when a link reference definition is present", () => {
    const source = "See [the docs][docs]\n\n[docs]: https://example.com";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("still splits when reference-like syntax only appears inside code", () => {
    const source =
      "Intro paragraph.\n\n```ts\ninterface Dict {\n  [key: string]: number;\n}\n```\n\nOutro paragraph.";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.join("")).toBe(source);
  });

  it("still splits when a footnote-like regex appears inside code", () => {
    const source =
      "Intro paragraph.\n\n```js\nconst re = /[^,]+/g;\nconst other = /[\\d]/;\n```\n\nOutro paragraph.";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.join("")).toBe(source);
  });

  it("splits when an unresolved shortcut reference has no definition", () => {
    // `[foo]` with no matching definition is plain text, not a reference, so it
    // must not force a single-block fallback.
    const source = "A line with [foo] in it.\n\nAnother paragraph.";
    const blocks = splitMarkdownBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks.join("")).toBe(source);
  });
});
