import { Lexer, type Token } from "marked";

/**
 * Footnote reference (`[^id]`) or definition (`[^id]:`). A footnote resolves
 * across top-level blocks — the reference points at a definition that may live
 * in another block — so a document containing either must be kept whole, since
 * independently-rendered subtrees can't see each other's definitions.
 *
 * The pattern requires at least one word/dash char inside `[^…]`, so a regex
 * character class such as `[^,]` or `[^\d]` (common inside code) never matches
 * and so never forces a needless single-block fallback.
 */
const FOOTNOTE = /\[\^[\w-]{1,200}\]/;

/** Counts `$$` runs in a string. */
function countDollarRuns(text: string): number {
  let runs = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "$" && text[i + 1] === "$") {
      runs++;
      i++;
    }
  }
  return runs;
}

/** Counts occurrences of a fixed two-char escape sequence (e.g. `\[`, `\]`). */
function countEscaped(text: string, second: string): number {
  let count = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "\\" && text[i + 1] === second) {
      count++;
      i++;
    }
  }
  return count;
}

/**
 * Whether a block ends inside an unterminated block-math region, which the
 * lexer would otherwise split at a blank line. Covers both `$$…$$` (odd number
 * of `$$` runs) and `\[…\]` display math (more openers than closers). Inline
 * `\(…\)` math never spans a blank line, so it needs no handling here.
 */
function hasOpenBlockMath(text: string): boolean {
  if (countDollarRuns(text) % 2 === 1) {
    return true;
  }
  return countEscaped(text, "[") > countEscaped(text, "]");
}

/**
 * Splits a markdown string into its top-level blocks, preserving every
 * character so that concatenating the result reproduces the input. Each block
 * is a self-contained markdown string that renders identically whether parsed
 * alone or as part of the whole document.
 *
 * Can be called on the *raw* source: math grouping handles both `$$…$$` and
 * `\[…\]` directly, so callers may repair/preprocess each returned block
 * independently rather than processing the whole document on every chunk.
 *
 * Uses `marked`'s block lexer rather than a full remark/mdast parse: the lexer
 * is roughly an order of magnitude faster, which matters because this runs on
 * every streamed chunk. A few constructs need explicit handling on top of the
 * raw token stream:
 *
 *  - **Block math** (`$$…$$` or `\[…\]` spanning a blank line): the lexer
 *    doesn't know math and would split it at the blank line, so a token
 *    following a block that ends inside an open math region is merged back in.
 *  - **Whitespace** between blocks is attached to the preceding block so trailing
 *    blank lines stay with the earlier block (and blocks remain append-only as
 *    the last one streams).
 *  - **Footnotes** and **link/image reference definitions** resolve across blocks
 *    and would break if split, so such documents are returned as a single block.
 *
 * As a final safety net, if the reconstructed blocks don't concatenate back to
 * the source exactly, the whole source is returned as one block rather than
 * risking corrupted or dropped content.
 */
export function splitMarkdownBlocks(source: string): string[] {
  if (source === "" || /^\s*$/.test(source)) {
    return [];
  }

  // Fast path: with no blank-line separator the document is, in practice, a
  // single top-level block, so skip the lexer entirely. Rendering it as one
  // block is always correct and avoids re-tokenising the whole string on every
  // streamed chunk of a single growing block (a long code fence or paragraph).
  if (!/\n[ \t]*\n/.test(source)) {
    return [source];
  }

  // Footnotes resolve across blocks; keep the document whole.
  if (FOOTNOTE.test(source)) {
    return [source];
  }

  let tokens: Token[];
  try {
    tokens = Lexer.lex(source, { gfm: true });
  } catch {
    return [source];
  }

  const blocks: string[] = [];
  // Cursor into the original source. Each token's text is taken as a *verbatim*
  // slice of the source rather than `token.raw`: `marked` normalises the raw of
  // an incomplete trailing construct mid-stream (e.g. a half-typed list item
  // `- First ` becomes `- First\n` — the dangling marker is trimmed and a
  // newline appended). The lengths match but the characters differ, so using
  // `raw` would corrupt the streaming block and trip the reconstruction guard,
  // collapsing the whole document into a single block on alternating chunks
  // (which resets the reveal wave and re-fades the entire message). Slicing the
  // source keeps every block byte-exact and append-only.
  let cursor = 0;
  for (const token of tokens) {
    // Link/image reference definitions resolve across blocks; keep whole.
    if (token.type === "def") {
      return [source];
    }

    const raw = token.raw;
    if (raw === "") {
      continue;
    }

    const end = Math.min(cursor + raw.length, source.length);
    const text = source.slice(cursor, end);
    cursor = end;

    const last = blocks.length - 1;
    const previous = last >= 0 ? blocks[last] : undefined;
    const mergeIntoPrevious =
      previous != null &&
      (token.type === "space" || hasOpenBlockMath(previous));

    if (mergeIntoPrevious) {
      blocks[last] += text;
    } else {
      blocks.push(text);
    }
  }

  if (blocks.length === 0) {
    return [source];
  }

  // Absorb any trailing source the tokens didn't account for onto the last
  // block so concatenation always reproduces the input exactly.
  if (cursor < source.length) {
    blocks[blocks.length - 1] += source.slice(cursor);
  }

  // Safety net: if anything was dropped or reordered, fall back to one block so
  // no characters are lost and cross-block constructs keep working.
  if (blocks.join("") !== source) {
    return [source];
  }

  return blocks;
}
