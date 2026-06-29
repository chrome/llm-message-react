import { codeToHtml } from "shiki/bundle/web";

import { createShikiHighlighter } from "../createShikiHighlighter";

/**
 * A ready-to-use highlighter backed by the smaller Shiki "web" bundle, which
 * covers the common web languages. Importing this entry opts the web bundle
 * into your build.
 *
 * @example
 * import { ShikiWebHighlighter } from "llm-message-react/shiki-web";
 * <LLMMessage highlighter={ShikiWebHighlighter}>{content}</LLMMessage>
 */
export const ShikiWebHighlighter = createShikiHighlighter(codeToHtml);
