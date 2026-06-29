import { codeToHtml } from "shiki";

import { createShikiHighlighter } from "../createShikiHighlighter";

/**
 * A ready-to-use highlighter backed by the full Shiki bundle (all languages
 * and themes). Importing this entry opts the full bundle into your build.
 *
 * @example
 * import { ShikiHighlighter } from "llm-message-react/shiki";
 * <LLMMessage highlighter={ShikiHighlighter}>{content}</LLMMessage>
 */
export const ShikiHighlighter = createShikiHighlighter(codeToHtml);
