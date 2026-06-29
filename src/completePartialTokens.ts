import katex from "katex";

/** Options controlling how {@link completePartialTokens} repairs the stream. */
export interface CompletePartialTokensOptions {
  /**
   * Progressively render unterminated *block* math (`\[…`, `$$…`) by closing
   * the open constructs and keeping the largest prefix KaTeX accepts. This is
   * convenient (a long block reveals row by row) but costs a synchronous KaTeX
   * parse on every chunk while the block streams. Set to `false` to instead
   * hide the block entirely until its closing delimiter arrives, skipping the
   * KaTeX work. Defaults to `true`.
   */
  showUnfinishedLatexBlocks?: boolean;
}

/**
 * Repairs partially-streamed markdown / LaTeX so that incomplete syntax does
 * not leak raw delimiter characters into the rendered output.
 *
 * While an LLM streams a response, the text often ends mid-token, e.g.
 * `**bold`, `` `code ``, `[label](http`, `$E = mc^2` or `\(a + b`. Rendered
 * as-is, those dangling delimiters show up as literal junk (`**`, `` ` ``, `[`,
 * `$`, `\(`). This function detects the unterminated constructs at the tail of
 * the string and:
 *  - closes safe inline formatting so it renders as intended (`**bold` →
 *    `**bold**`, `` `code `` → `` `code` ``);
 *  - hides fragments that cannot be completed yet, namely incomplete links and
 *    incomplete inline math (`$…`, `\(…`);
 *  - progressively renders incomplete *block* math (`\[…`, `$$…`): instead of
 *    hiding the whole block until it finishes streaming, it closes the open
 *    environments/braces and renders the largest prefix KaTeX accepts, so a
 *    long aligned block reveals row by row instead of popping in at the end.
 *
 * It is a no-op for already-complete text, so it is safe to run on every chunk.
 *
 * @param text The (possibly mid-stream) markdown string.
 * @returns The string with trailing incomplete tokens repaired.
 */
export function completePartialTokens(
  text: string,
  options?: CompletePartialTokensOptions,
): string {
  if (!text) return text;

  const showUnfinishedLatexBlocks = options?.showUnfinishedLatexBlocks ?? true;

  // An unterminated fenced code block is fine on its own: remark renders it to
  // the end of the document and the partial content reads correctly as code,
  // so we must not touch any of the (markdown-looking) characters inside it.
  if (hasUnclosedCodeFence(text)) {
    return text;
  }

  const protectedSpans: string[] = [];
  const protect = (value: string): string =>
    `\u0000llmph${protectedSpans.push(value) - 1}\u0000`;

  // Protect complete fenced code blocks and complete inline code spans so their
  // contents are never mistaken for markdown/LaTeX markers. Double-backtick
  // spans are protected before single-backtick ones so a span that itself
  // contains a backtick (`` a`b ``) is not mangled by the single-backtick pass.
  let working = text.replace(/```[\s\S]*?```/g, (match) => protect(match));
  working = working.replace(/``[\s\S]*?``/g, (match) => protect(match));
  working = working.replace(/`[^`\n]+`/g, (match) => protect(match));

  // A leftover single backtick starts an unterminated inline code span. Protect
  // the rest of the line and close it so the in-progress code renders cleanly.
  const lastBacktick = working.lastIndexOf("`");
  if (lastBacktick !== -1) {
    // Bound the in-progress span to its own line so trailing markdown on later
    // lines is not swallowed into the protected code.
    const newline = working.indexOf("\n", lastBacktick);
    const end = newline === -1 ? working.length : newline;
    const span = working.slice(lastBacktick, end);
    working =
      working.slice(0, lastBacktick) +
      protect(`${span}\``) +
      working.slice(end);
  }

  working = repairIncompleteMath(working, showUnfinishedLatexBlocks);
  working = hideIncompleteLink(working);
  working = completePartialTable(working);
  working = hideDanglingListMarker(working);
  working = closeUnbalancedEmphasis(working);

  return working.replace(
    /\u0000llmph(\d+)\u0000/g,
    (_match, index: string) => protectedSpans[Number(index)] ?? "",
  );
}

/**
 * Completes a partially-streamed GFM table delimiter row.
 *
 * A table needs a full delimiter row (`| --- | --- |`) to be recognised, so
 * while it streams the buffer ends with a header row followed by a fragment like
 * `| ---`. Without a valid delimiter remark-gfm collapses both lines into a
 * paragraph ("| Feature | Works | | ---"). Once a delimiter fragment appears we
 * already know the column count from the header, so we expand the fragment to a
 * complete delimiter, preserving any alignment colons that have streamed in.
 */
function completePartialTable(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 2) return text;

  const last = lines[lines.length - 1];
  // The candidate delimiter must contain only delimiter characters and at least
  // one dash; anything else (letters, etc.) means it is a header or body row.
  if (!/-/.test(last) || !/^[\s|:-]*$/.test(last)) return text;

  const header = lines[lines.length - 2];
  if (!header.includes("|")) return text;

  // If the table already has a delimiter row at or above the candidate, then
  // the candidate is just a body row that happens to contain only dashes/pipes
  // (not a streaming delimiter), so the table is complete and must be left
  // untouched. Walk up the contiguous block of pipe rows to detect that.
  for (let i = lines.length - 2; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes("|")) break;
    if (/-/.test(line) && /^[\s|:-]*$/.test(line)) return text;
  }

  const columns = countTableColumns(header);
  lines[lines.length - 1] = buildDelimiterRow(last, columns);
  return lines.join("\n");
}

/** Counts the cells in a GFM table row, ignoring the outer pipes. */
function countTableColumns(row: string): number {
  let inner = row.trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  return inner.split("|").length;
}

/**
 * Builds a delimiter row with `columns` cells, reusing any alignment colons
 * already present in the streamed fragment.
 */
function buildDelimiterRow(fragment: string, columns: number): string {
  let inner = fragment.trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  const existing = inner.split("|").map((cell) => cell.trim());

  const cells = Array.from({ length: columns }, (_unused, index) => {
    const spec = existing[index] ?? "";
    const left = spec.startsWith(":");
    const right = spec.endsWith(":");
    if (left && right) return ":---:";
    if (right) return "---:";
    if (left) return ":---";
    return "---";
  });

  return `| ${cells.join(" | ")} |`;
}

/**
 * Hides a trailing line that would be parsed as a setext heading underline.
 *
 * Mid-stream a bullet list arrives a character at a time, so the buffer briefly
 * ends with `paragraph\n-` before the item text follows. In CommonMark a lone
 * run of dashes directly beneath a non-blank line is a setext H2 underline, so
 * a line like "Unordered list:" would flash as a heading until "- Item" streams
 * in. We drop the dangling marker until it gains content. A blank line above the
 * dashes makes them a thematic break instead, which is left untouched.
 */
function hideDanglingListMarker(text: string): string {
  const match = text.match(/\n[ \t]{0,3}-+[ \t]*$/);
  if (match?.index == null) return text;

  const before = text.slice(0, match.index);
  const prevLine = before.slice(before.lastIndexOf("\n") + 1);
  if (prevLine.trim() === "") return text;

  return before;
}

/**
 * True when a code fence is left open. Backtick (```) and tilde (~~~) fences are
 * counted separately so that a complete block of one kind that happens to
 * contain a line of the other kind is not mistaken for an unbalanced fence.
 */
function hasUnclosedCodeFence(text: string): boolean {
  const backticks = (text.match(/^[ \t]{0,3}```/gm) ?? []).length;
  const tildes = (text.match(/^[ \t]{0,3}~~~/gm) ?? []).length;
  return backticks % 2 === 1 || tildes % 2 === 1;
}

/**
 * Drops a trailing, still-incomplete link or image, e.g. `[label`, `![alt` or
 * `[label](http`. Closed bracket fragments such as `arr[i]` or `[label]` are
 * left untouched to avoid hiding legitimate text.
 */
function hideIncompleteLink(text: string): string {
  // Find the last "[" that is not an escaped LaTeX delimiter ("\[").
  let open = -1;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "[" && text[i - 1] !== "\\") {
      open = i;
      break;
    }
  }
  if (open === -1) return text;

  const start = open > 0 && text[open - 1] === "!" ? open - 1 : open;
  const rest = text.slice(open);

  // Label is still open: "[lab" / "![al".
  if (!rest.includes("]")) {
    return text.slice(0, start);
  }
  // Label closed, destination opened but not yet closed: "[lab](http".
  if (/^\[[^\]]*\]\([^)]*$/.test(rest)) {
    return text.slice(0, start);
  }
  return text;
}

/** A math delimiter that has been opened but not yet closed in the stream. */
interface OpenMath {
  /** Index of the opening delimiter in the source string. */
  index: number;
  /** The opening delimiter itself, e.g. `"\\["` or `"$$"`. */
  open: string;
  /** The closing delimiter to append once repaired, empty for inline math. */
  close: string;
  /** Whether the math is block (display) math we try to render progressively. */
  block: boolean;
  /** Whether to render in KaTeX display mode when validating a candidate. */
  display: boolean;
}

/**
 * Repairs an unterminated LaTeX region at the tail of the stream.
 *
 * Inline math (`$…`, `\(…`) is short, so it is simply hidden until it finishes
 * streaming. Block math (`\[…`, `$$…`) is instead rendered progressively: we
 * close any open environments/braces and keep the largest leading slice that
 * KaTeX can parse, so a multi-line block reveals itself as it streams instead
 * of staying blank until the closing delimiter finally arrives.
 */
function repairIncompleteMath(
  text: string,
  showUnfinishedLatexBlocks: boolean,
): string {
  const countOf = (pattern: RegExp): number =>
    (text.match(pattern) ?? []).length;

  const opens: OpenMath[] = [];

  // Display math: \[ ... \]
  if (countOf(/\\\[/g) > countOf(/\\\]/g)) {
    opens.push({
      index: text.lastIndexOf("\\["),
      open: "\\[",
      close: "\\]",
      block: true,
      display: true,
    });
  }

  // Inline math: \( ... \)
  if (countOf(/\\\(/g) > countOf(/\\\)/g)) {
    opens.push({
      index: text.lastIndexOf("\\("),
      open: "\\(",
      close: "",
      block: false,
      display: false,
    });
  }

  if (countOf(/\$\$/g) % 2 === 1) {
    // Display math: $$ ... $$
    opens.push({
      index: text.lastIndexOf("$$"),
      open: "$$",
      close: "$$",
      block: true,
      display: true,
    });
  } else {
    // Inline math: $ ... $. Mask complete "$$" pairs (keeping indices stable),
    // then ignore escaped "\$" and currency like "$5" to avoid false positives.
    let masked = text.replace(/\$\$/g, "  ");
    // Also mask complete single-line "$…$" spans that contain a LaTeX command
    // (so they are real math, not "$5" currency). Their opening "$" may be
    // followed by a digit (e.g. "$15 \text{ г}$"), which the currency guard
    // below would otherwise drop from the count while still counting the
    // closing "$", flipping the parity and hiding trailing content by mistake.
    masked = masked.replace(
      /(?<!\\)\$(?!\$)[^$\n]*?\\[a-zA-Z][^$\n]*?\$/g,
      (m) => " ".repeat(m.length),
    );
    // Same parity hazard for command-free numeric spans (e.g. "$0$", "$15$"):
    // the opening "$" is dropped by the currency guard below while the closing
    // "$" is still counted. Mask these balanced numeric spans too so neither
    // delimiter is counted. Plain currency ("$5 and $10") has prose between the
    // dollars, so it matches neither this nor the command mask and is left for
    // the currency guard to handle.
    masked = masked.replace(
      /(?<!\\)\$(?!\$)\d[\d\s.,+\-*/=]*\$/g,
      (m) => " ".repeat(m.length),
    );
    let lastDollar = -1;
    for (const match of masked.matchAll(/(?<!\\)\$(?!\d)/g)) {
      lastDollar = match.index;
    }
    const singles = masked.match(/(?<!\\)\$(?!\d)/g) ?? [];
    if (singles.length % 2 === 1 && lastDollar !== -1) {
      opens.push({
        index: lastDollar,
        open: "$",
        close: "",
        block: false,
        display: false,
      });
    }
  }

  const valid = opens.filter((entry) => entry.index >= 0);
  if (valid.length === 0) return text;

  // The earliest opener marks where the incomplete math region begins; anything
  // after it is part of the unterminated construct.
  const open = valid.reduce((a, b) => (b.index < a.index ? b : a));
  const before = text.slice(0, open.index);

  if (!open.block) {
    // Inline math is hidden until it finishes streaming.
    return before;
  }

  // When progressive block rendering is disabled, hide the unterminated block
  // until its closing delimiter arrives, skipping the KaTeX validation cost.
  if (!showUnfinishedLatexBlocks) {
    return before;
  }

  const inner = text.slice(open.index + open.open.length);
  const body = bestRenderableMathBody(inner, open.display);
  if (body == null) return before;

  // Reproduce the original fenced layout so the markdown math parser can detect
  // the closing delimiter. When the block opens on its own line (`\[\n…`), the
  // closing delimiter must also sit on its own line; otherwise micromark treats
  // the run as inline math, never finds the closing fence, and KaTeX renders a
  // parse error that swallows the trailing delimiter.
  const blockLayout = /^[ \t]*\r?\n/.test(inner);
  if (!blockLayout) {
    return before + open.open + body + open.close;
  }
  const opener =
    before === "" || before.endsWith("\n") ? open.open : `\n${open.open}`;
  return `${before}${opener}${body.replace(/\s+$/, "")}\n${open.close}`;
}

/**
 * Returns the largest leading slice of incomplete block-math content that KaTeX
 * can render, with its open environments and braces closed, or `null` when no
 * usable prefix exists yet (in which case the caller hides the fragment).
 *
 * When an environment is still open (e.g. `\begin{aligned}` mid-stream) we
 * prefer revealing only the complete rows so each equation appears fully formed,
 * falling back to a token-level repair so single-line blocks still stream in.
 */
function bestRenderableMathBody(
  inner: string,
  display: boolean,
): string | null {
  const candidates = unclosedEnvironments(inner).length > 0
    ? [closeOpenMathConstructs(truncateToLastRow(inner)), closeOpenMathConstructs(trimIncompleteMathTail(inner))]
    : [closeOpenMathConstructs(trimIncompleteMathTail(inner))];

  for (const candidate of candidates) {
    if (!hasRenderableMathContent(candidate)) continue;
    if (isRenderableMath(candidate, display)) return candidate;
  }
  return null;
}

/** True when a math body contains something other than empty environment scaffolding. */
function hasRenderableMathContent(body: string): boolean {
  const stripped = body
    .replace(/\\(?:begin|end)\s*\{[^}]*\}/g, "")
    .replace(/[\s{}]/g, "");
  return stripped.length > 0;
}

/**
 * True when KaTeX can render the math body without raising a parse error.
 *
 * Uses the public, stable `renderToString` entry point (with `throwOnError`)
 * rather than any internal parse-only API, so it keeps working across KaTeX
 * upgrades. We only care whether it throws; the produced string is discarded.
 */
function isRenderableMath(body: string, display: boolean): boolean {
  try {
    katex.renderToString(body, {
      displayMode: display,
      throwOnError: true,
      strict: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Keeps only the complete rows of a multi-line environment by cutting back to
 * the last row separator (`\\`), dropping the partially-streamed current row.
 * Returns an empty string when no full row has streamed yet.
 */
function truncateToLastRow(inner: string): string {
  const lastRow = inner.lastIndexOf("\\\\");
  if (lastRow === -1) return "";
  return inner.slice(0, lastRow + 2);
}

/**
 * Drops trailing tokens that cannot render on their own yet: surrounding
 * whitespace, a dangling backslash, an in-progress control word (`\frac` may
 * still be `\fra`), and a subscript/superscript with no argument. A complete
 * `\\` row separator is preserved.
 */
function trimIncompleteMathTail(inner: string): string {
  let result = inner;
  let previous: string;
  do {
    previous = result;
    result = result.replace(/\s+$/, "");
    // A trailing odd run of backslashes ends in a lone "\" (an incomplete "\\"
    // or the start of a command); drop it. An even run is complete "\\".
    const backslashes = result.match(/\\+$/);
    if (backslashes != null && backslashes[0].length % 2 === 1) {
      result = result.slice(0, -1);
    }
    // A trailing control word is ambiguous mid-stream; drop it so it cannot be
    // an unknown (and therefore error-rendered) command.
    result = result.replace(/\\[a-zA-Z]+\*?$/, "");
    // A subscript/superscript needs an argument that has not arrived yet.
    result = result.replace(/[_^]$/, "");
  } while (result !== previous);
  return result;
}

/**
 * Closes the constructs left open in a math fragment so KaTeX can parse it:
 * unmatched `\left`, unbalanced `{` groups, and unclosed environments. Order is
 * a best effort; the caller validates the result with KaTeX regardless.
 */
function closeOpenMathConstructs(inner: string): string {
  let result = inner;

  const lefts = (result.match(/\\left(?![a-zA-Z])/g) ?? []).length;
  const rights = (result.match(/\\right(?![a-zA-Z])/g) ?? []).length;
  result += "\\right.".repeat(Math.max(0, lefts - rights));

  result += "}".repeat(openBraceDepth(result));

  const environments = unclosedEnvironments(result);
  for (let i = environments.length - 1; i >= 0; i--) {
    result += `\\end{${environments[i]}}`;
  }
  return result;
}

/** Counts unclosed `{` groups, ignoring escaped braces (`\{`, `\}`). */
function openBraceDepth(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}" && depth > 0) depth--;
  }
  return depth;
}

/**
 * Returns the names of environments opened with `\begin{…}` but not yet closed
 * with a matching `\end{…}`, outermost first.
 */
function unclosedEnvironments(text: string): string[] {
  const stack: string[] = [];
  const pattern = /\\(begin|end)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) != null) {
    const name = match[2];
    if (match[1] === "begin") {
      stack.push(name);
    } else {
      const index = stack.lastIndexOf(name);
      if (index !== -1) stack.splice(index, 1);
      else stack.pop();
    }
  }
  return stack;
}

/**
 * Closes unterminated emphasis runs: ~~strike~~, **bold**, *italic*, __bold__
 * and _italic_.
 */
function closeUnbalancedEmphasis(text: string): string {
  let result = text;
  result = closeRunMarker(result, "~~");
  // Close a single "*" first so a "***" opener becomes "*" + "**" and both
  // halves get closed, yielding a balanced "***…***".
  result = closeSingleAsterisk(result);
  result = closeRunMarker(result, "**");
  result = closeSingleUnderscore(result);
  result = closeDoubleUnderscore(result);
  return result;
}

/**
 * True when the marker at `index` begins a delimiter run that could open
 * emphasis: it sits at the start of the string or directly after a non-word
 * character (whitespace or punctuation). Underscores require this so intra-word
 * usage (`snake_case`, `__init__`) is never treated as a dangling emphasis
 * opener.
 */
function opensAtWordBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  // Whitespace or punctuation before the marker counts as a boundary; an
  // alphanumeric character (or another underscore) does not, so intra-word
  // usage (`snake_case`, `__init__`) is never treated as a dangling opener
  // while a leading-punctuation case like `(_italic` still closes.
  return !/[\p{L}\p{N}_]/u.test(text[index - 1]);
}

/**
 * Closes a single `_` italic marker. `__` pairs are masked out first, and the
 * marker is only closed when it both opens at a word boundary and sits directly
 * before a non-space character, so `snake_case` is left alone.
 */
function closeSingleUnderscore(text: string): string {
  const masked = text.replace(/__/g, "");
  const count = (masked.match(/_/g) ?? []).length;
  if (count % 2 === 0) return text;

  const lastIndex = text.lastIndexOf("_");
  const after = text.slice(lastIndex + 1);
  if (after.length === 0 || /^[\s_]/.test(after)) return text;
  if (!opensAtWordBoundary(text, lastIndex)) return text;

  return insertBeforeTrailingWhitespace(text, "_");
}

/**
 * Closes a `__` bold marker when it is unbalanced, opens at a word boundary,
 * and is directly followed by a non-space character (so `a__b` and `__init__`
 * are left untouched).
 */
function closeDoubleUnderscore(text: string): string {
  const count = (text.match(/__/g) ?? []).length;
  if (count % 2 === 0) return text;

  const lastIndex = text.lastIndexOf("__");
  const after = text.slice(lastIndex + 2);
  if (after.length === 0 || /^\s/.test(after)) return text;
  if (!opensAtWordBoundary(text, lastIndex)) return text;

  return insertBeforeTrailingWhitespace(text, "__");
}

/**
 * Closes a two-character emphasis marker (`**` or `~~`) when it is unbalanced
 * and the final marker looks like an opener (immediately followed by a
 * non-space character), which avoids touching list markers or operators.
 */
function closeRunMarker(text: string, marker: string): string {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const count = (text.match(new RegExp(escaped, "g")) ?? []).length;
  if (count % 2 === 0) return text;

  const lastIndex = text.lastIndexOf(marker);
  const after = text.slice(lastIndex + marker.length);
  if (after.length === 0 || /^\s/.test(after)) return text;

  return insertBeforeTrailingWhitespace(text, marker);
}

/**
 * Closes a single `*` italic marker. `**` pairs are masked out first, and the
 * marker is only closed when it sits directly before a non-space character so
 * bullet markers (`* item`) and multiplication (`2 * 3`) are left alone.
 */
function closeSingleAsterisk(text: string): string {
  const masked = text.replace(/\*\*/g, "");
  const count = (masked.match(/\*/g) ?? []).length;
  if (count % 2 === 0) return text;

  const lastIndex = text.lastIndexOf("*");
  const after = text.slice(lastIndex + 1);
  if (after.length === 0 || /^[\s*]/.test(after)) return text;

  return insertBeforeTrailingWhitespace(text, "*");
}

/**
 * Appends a closing emphasis marker, but places it before any trailing
 * whitespace. A closer such as `**` is only valid when it directly follows a
 * non-space character, so `**bold ` must become `**bold** ` rather than the
 * un-renderable `**bold **`.
 */
function insertBeforeTrailingWhitespace(text: string, marker: string): string {
  const trailing = text.match(/\s+$/)?.[0] ?? "";
  const core = text.slice(0, text.length - trailing.length);
  return core + marker + trailing;
}
