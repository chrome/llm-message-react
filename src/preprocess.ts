/**
 * Matches a fenced code block or an inline code span. Shared by
 * {@link preprocessLaTeX} and {@link escapeBrackets} so both functions treat
 * code identically; composed into the larger patterns below via `.source`.
 */
const CODE_SPAN = /```[\s\S]*?```|`[^`\n]+`/;

/**
 * Preprocesses LaTeX content by replacing delimiters and escaping certain characters.
 *
 * @param content The input string containing LaTeX expressions.
 * @returns The processed string with replaced delimiters and escaped characters.
 */
export function preprocessLaTeX(content: string): string {
  // Step 1: Protect code blocks
  const codeBlocks: string[] = [];
  content = content.replace(
    new RegExp(`(${CODE_SPAN.source})`, "g"),
    (_match, code) => {
      codeBlocks.push(code);
      return `<<CODE_BLOCK_${codeBlocks.length - 1}>>`;
    },
  );

  // Step 2: Protect existing LaTeX expressions. This is what makes the currency
  // escaping in Step 3 safe: by pulling complete `$$…$$` / `\[…\]` / `\(…\)`
  // regions out of the string first, the `\$(?=\d)` pass below cannot corrupt a
  // `$` that legitimately belongs to a math expression (e.g. `$$x = $5$$`).
  const latexExpressions: string[] = [];
  content = content.replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g,
    (match) => {
      latexExpressions.push(match);
      return `<<LATEX_${latexExpressions.length - 1}>>`;
    },
  );

  // Step 3: Escape dollar signs that are likely currency indicators
  content = content.replace(/\$(?=\d)/g, "\\$");

  // Step 4: Restore LaTeX expressions
  content = content.replace(
    /<<LATEX_(\d+)>>/g,
    (_, index) => latexExpressions[parseInt(index, 10)],
  );

  // Step 5: Restore code blocks
  content = content.replace(
    /<<CODE_BLOCK_(\d+)>>/g,
    (_, index) => codeBlocks[parseInt(index, 10)],
  );

  // Step 6: Apply additional escaping functions
  content = escapeBrackets(content);
  content = escapeMhchem(content);

  return content;
}

export function escapeBrackets(text: string): string {
  const pattern = new RegExp(
    `(${CODE_SPAN.source})|` +
      /\\\[((?:[\s\S]*?[^\\])?)\\]|\\\((.*?)\\\)/.source,
    "g",
  );
  return text.replace(
    pattern,
    (
      match: string,
      codeBlock: string | undefined,
      squareBracket: string | undefined,
      roundBracket: string | undefined,
    ): string => {
      if (codeBlock != null) {
        return codeBlock;
      } else if (squareBracket != null) {
        return `$$${squareBracket}$$`;
      } else if (roundBracket != null) {
        return `$${roundBracket}$`;
      }
      return match;
    },
  );
}

export function escapeMhchem(text: string): string {
  return text.replaceAll("$\\ce{", "$\\\\ce{").replaceAll("$\\pu{", "$\\\\pu{");
}
