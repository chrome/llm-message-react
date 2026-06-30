import { useMemo } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import {
  buildMarkdownComponents,
  cx,
} from "./buildMarkdownComponents";
import { MarkdownBlock } from "./MarkdownBlock";
import type {
  CodeHighlighter,
  LLMMessageClassNames,
  LLMMessageComponents,
} from "./types";
import { useMarkdownBlocks } from "./useMarkdownBlocks";
import { useSmoothReveal } from "./useSmoothReveal";

export interface LLMMessageProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "content"> {
  /** The LLM message content as a markdown string. */
  children?: string;
  /** Alias for `children`. */
  content?: string;
  /** Class applied to the root element (merged with the built-in class). */
  className?: string;
  /** Per-element class overrides (merged with the built-in classes). */
  classNames?: LLMMessageClassNames;
  /** Per-element component overrides for full markup control. */
  components?: LLMMessageComponents;
  /**
   * Repair partially-streamed markdown/LaTeX so unterminated tokens (e.g.
   * `**bold`, `` `code ``, `[label](http`, `$E = mc^2`) do not render as raw
   * delimiter junk while the response is still streaming. Defaults to `true`.
   */
  completePartialTokens?: boolean;
  /**
   * Progressively render unterminated *block* math (`\[…`, `$$…`) while it
   * streams, instead of hiding it until the closing delimiter arrives. This is
   * nicer to watch (a long block reveals row by row) but costs a synchronous
   * KaTeX parse on every chunk that contains an open block. Set to `false` to
   * hide unfinished blocks and skip that work. Only relevant while
   * `completePartialTokens` is enabled. Defaults to `true`.
   */
  showUnfinishedLatexBlocks?: boolean;
  /**
   * Fade newly-streamed text in character-by-character (and complex blocks as a
   * whole) instead of popping it in. Purely visual: text is always in the DOM
   * immediately, it just eases from transparent. Respects
   * `prefers-reduced-motion`. Defaults to `false`.
   */
  smoothReveal?: boolean;
  /**
   * The reveal window for a freshly-arrived chunk, in milliseconds. Each batch
   * of new characters is staggered so it finishes within roughly this window;
   * when a new chunk arrives mid-animation the leftover plus the new text reveal
   * over a fresh window. Only relevant while `smoothReveal` is enabled.
   * Defaults to `300`.
   */
  smoothRevealDuration?: number;
  /**
   * Split the message into top-level markdown blocks and render each as its own
   * memoized subtree, so a streaming update only re-parses/re-renders the last
   * (currently growing) block instead of the whole message. This keeps KaTeX
   * and code highlighting in earlier blocks from re-running on every chunk.
   *
   * Set to `false` to render the whole message as a single tree (needed for
   * documents that rely on constructs spanning blocks, e.g. footnote or link
   * reference definitions). Defaults to `true`.
   */
  blockMemoization?: boolean;
  /**
   * Optional syntax highlighter for fenced code blocks. When omitted, code
   * blocks render as plain text (so no highlighter bundle is pulled in). Pass
   * `ShikiHighlighter` / `ShikiWebHighlighter`, or build your own with
   * `createShikiHighlighter`.
   */
  highlighter?: CodeHighlighter;
}

const remarkPlugins = [remarkGfm, remarkMath];

type RehypePlugins = NonNullable<Options["rehypePlugins"]>;

export function LLMMessage({
  children,
  content,
  className,
  classNames,
  components,
  completePartialTokens: repairPartialTokens = true,
  showUnfinishedLatexBlocks = true,
  smoothReveal = false,
  smoothRevealDuration = 300,
  blockMemoization = true,
  highlighter,
  style,
  ...rest
}: LLMMessageProps) {
  const source = content ?? children ?? "";

  const markdownComponents = useMemo(
    () => buildMarkdownComponents(classNames, components, highlighter),
    [classNames, components, highlighter],
  );

  const { renderedBlocks, activeIndex, activeSource } = useMarkdownBlocks({
    source,
    blockMemoization,
    repairPartialTokens,
    showUnfinishedLatexBlocks,
    smoothReveal,
  });

  const { rootRef, fadePlugin, revealStyle } = useSmoothReveal({
    activeSource,
    activeKey: activeIndex,
    enabled: smoothReveal,
    duration: smoothRevealDuration,
  });

  // Stable rehype-plugin arrays, selected per block so KaTeX runs only on blocks
  // that actually contain math (`$`). The fade plugin is attached to the active
  // block only. All four references are stable across renders, so a block whose
  // content and math-ness are unchanged keeps the same array reference and stays
  // memoized.
  const pluginSets = useMemo(() => {
    const math: RehypePlugins = [rehypeKatex];
    const none: RehypePlugins = [];
    return {
      math,
      none,
      activeMath: fadePlugin ? [rehypeKatex, fadePlugin] : math,
      activeNone: fadePlugin ? [fadePlugin] : none,
    };
  }, [fadePlugin]);

  const rootStyle: CSSProperties | undefined = revealStyle
    ? { ...style, ...revealStyle }
    : style;

  return (
    <div
      ref={rootRef}
      className={cx("llm-message", classNames?.root, className)}
      style={rootStyle}
      {...rest}
    >
      {renderedBlocks.map((block, index) => {
        const isActive = index === activeIndex;
        // After preprocessing all math uses `$`; a block without one cannot
        // contain math, so KaTeX can be skipped for it entirely.
        const hasMath = block.includes("$");
        const rehypePlugins = isActive
          ? hasMath
            ? pluginSets.activeMath
            : pluginSets.activeNone
          : hasMath
            ? pluginSets.math
            : pluginSets.none;
        return (
          <MarkdownBlock
            // Index keys keep stable blocks mounted across chunks; blocks are
            // append-only, so content changes flow through props and the memo
            // comparison rather than remounting.
            key={index}
            content={block}
            components={markdownComponents}
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
          />
        );
      })}
    </div>
  );
}
