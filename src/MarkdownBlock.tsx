import { memo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";

type RemarkPlugins = NonNullable<Options["remarkPlugins"]>;
type RehypePlugins = NonNullable<Options["rehypePlugins"]>;

export interface MarkdownBlockProps {
  content: string;
  components: Components;
  remarkPlugins: RemarkPlugins;
  rehypePlugins: RehypePlugins;
}

/**
 * A single top-level markdown block. Memoized so that stable blocks (every
 * block except the one currently being streamed) skip re-rendering — and thus
 * skip re-parsing and re-running KaTeX / code highlighting — when a new chunk
 * only changes the last block. `components` and the plugin arrays are stable
 * references, so the comparison effectively keys on `content`.
 */
export const MarkdownBlock = memo(function MarkdownBlock({
  content,
  components,
  remarkPlugins: remark,
  rehypePlugins,
}: MarkdownBlockProps) {
  return (
    <ReactMarkdown
      remarkPlugins={remark}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});
