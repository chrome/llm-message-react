import { clsx } from "clsx";
import { memo, useDeferredValue, useMemo, useRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { completePartialTokens } from "./completePartialTokens";
import { CopyButton } from "./CopyButton";
import { preprocessLaTeX } from "./preprocess";
import { splitMarkdownBlocks } from "./splitBlocks";
import type {
  CodeHighlighter,
  LLMMessageClassNames,
  LLMMessageComponents,
} from "./types";
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

type RemarkPlugins = NonNullable<Options["remarkPlugins"]>;
type RehypePlugins = NonNullable<Options["rehypePlugins"]>;

interface MarkdownBlockProps {
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
const MarkdownBlock = memo(function MarkdownBlock({
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

function cx(...inputs: Array<string | undefined>): string | undefined {
  const result = clsx(inputs);
  return result === "" ? undefined : result;
}

function buildComponents(
  classNames: LLMMessageClassNames | undefined,
  overrides: LLMMessageComponents | undefined,
  highlighter: CodeHighlighter | undefined,
): Components {
  const cn = classNames ?? {};
  const o = overrides ?? {};
  const Highlighter = highlighter;

  // Merged class strings depend only on `classNames`, which is stable for the
  // lifetime of this (memoized) component map, so we compute them once here
  // instead of running `clsx` for every element on every render. Elements that
  // also receive a per-node `className` from react-markdown (inline code,
  // blockquote, list items) cache the static part and only re-run `clsx` when a
  // dynamic class is actually present.
  const c = {
    code: cx("llm-code", cn.code),
    codeBlock: cx("llm-code-block", cn.codeBlock),
    codeHeader: cx("llm-code-header", cn.codeHeader),
    codeLanguage: cx("llm-code-language", cn.codeLanguage),
    copyButton: cx("llm-copy-button", cn.copyButton),
    tableWrapper: cx("llm-table-wrapper", cn.tableWrapper),
    table: cx("llm-table", cn.table),
    th: cx("llm-th", cn.th),
    td: cx("llm-td", cn.td),
    blockquote: cx("llm-blockquote", cn.blockquote),
    ul: cx("llm-ul", cn.ul),
    ol: cx("llm-ol", cn.ol),
    li: cx("llm-li", cn.li),
    p: cx("llm-p", cn.p),
    h1: cx("llm-h1", cn.h1),
    h2: cx("llm-h2", cn.h2),
    h3: cx("llm-h3", cn.h3),
    h4: cx("llm-h4", cn.h4),
    h5: cx("llm-h5", cn.h5),
    h6: cx("llm-h6", cn.h6),
    checkbox: cx("llm-checkbox", cn.checkbox),
    a: cx("llm-a", cn.a),
    img: cx("llm-img", cn.img),
    hr: cx("llm-hr", cn.hr),
    strong: cx("llm-strong", cn.strong),
    em: cx("llm-em", cn.em),
    del: cx("llm-del", cn.del),
  };

  // Combine a precomputed base class with an optional per-node class, avoiding a
  // `clsx` call entirely when there is no dynamic class to merge.
  const merge = (
    base: string | undefined,
    extra: string | undefined,
  ): string | undefined => (extra ? cx(base, extra) : base);

  return {
    code({ node: _node, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeText = String(children).replace(/\n$/, "");
      // A fenced block always spans its own lines (so its text contains a
      // newline) even when no language info string is present; inline code
      // never does. Relying on the `language-` class alone would misrender a
      // bare ``` fence as inline code.
      const isBlock = match != null || String(children).includes("\n");

      if (isBlock) {
        const language = match?.[1] ?? "";
        if (o.codeBlock) {
          const CodeBlock = o.codeBlock;
          return (
            <CodeBlock
              code={codeText}
              language={language}
              className={cn.codeBlock}
            />
          );
        }
        return (
          <div className={c.codeBlock}>
            <div className={c.codeHeader}>
              <span className={c.codeLanguage}>{language}</span>
              {o.copyButton ? (
                <o.copyButton text={codeText} className={cn.copyButton} />
              ) : (
                <CopyButton text={codeText} className={c.copyButton} />
              )}
            </div>
            <div className="llm-code-body">
              {Highlighter ? (
                <Highlighter code={codeText} language={language} />
              ) : (
                <code className="llm-code-plain">{codeText}</code>
              )}
            </div>
          </div>
        );
      }

      if (o.code) {
        const InlineCode = o.code;
        return (
          <InlineCode className={merge(c.code, className)}>
            {children}
          </InlineCode>
        );
      }

      return (
        <code className={merge(c.code, className)} {...props}>
          {children}
        </code>
      );
    },
    pre({ children }) {
      if (o.pre) {
        return <o.pre>{children}</o.pre>;
      }
      // Let the code component handle fenced blocks.
      return <>{children}</>;
    },
    table({ children }) {
      if (o.table) {
        return <o.table className={cn.table}>{children}</o.table>;
      }
      return (
        <div className={c.tableWrapper}>
          <table className={c.table}>{children}</table>
        </div>
      );
    },
    th({ children, style }) {
      if (o.th) {
        return <o.th className={cn.th}>{children}</o.th>;
      }
      return (
        <th className={c.th} style={style}>
          {children}
        </th>
      );
    },
    td({ children, style }) {
      if (o.td) {
        return <o.td className={cn.td}>{children}</o.td>;
      }
      return (
        <td className={c.td} style={style}>
          {children}
        </td>
      );
    },
    blockquote({ children, className, style }) {
      if (o.blockquote) {
        return <o.blockquote className={cn.blockquote}>{children}</o.blockquote>;
      }
      return (
        <blockquote className={merge(c.blockquote, className)} style={style}>
          {children}
        </blockquote>
      );
    },
    ul({ children }) {
      if (o.ul) {
        return <o.ul className={cn.ul}>{children}</o.ul>;
      }
      return <ul className={c.ul}>{children}</ul>;
    },
    ol({ children }) {
      if (o.ol) {
        return <o.ol className={cn.ol}>{children}</o.ol>;
      }
      return <ol className={c.ol}>{children}</ol>;
    },
    li({ children, className, style }) {
      if (o.li) {
        return <o.li className={cn.li}>{children}</o.li>;
      }
      return (
        <li className={merge(c.li, className)} style={style}>
          {children}
        </li>
      );
    },
    p({ children }) {
      if (o.p) {
        return <o.p className={cn.p}>{children}</o.p>;
      }
      return <p className={c.p}>{children}</p>;
    },
    h1({ children }) {
      if (o.h1) {
        return <o.h1 className={cn.h1}>{children}</o.h1>;
      }
      return <h1 className={c.h1}>{children}</h1>;
    },
    h2({ children }) {
      if (o.h2) {
        return <o.h2 className={cn.h2}>{children}</o.h2>;
      }
      return <h2 className={c.h2}>{children}</h2>;
    },
    h3({ children }) {
      if (o.h3) {
        return <o.h3 className={cn.h3}>{children}</o.h3>;
      }
      return <h3 className={c.h3}>{children}</h3>;
    },
    h4({ children }) {
      if (o.h4) {
        return <o.h4 className={cn.h4}>{children}</o.h4>;
      }
      return <h4 className={c.h4}>{children}</h4>;
    },
    h5({ children }) {
      if (o.h5) {
        return <o.h5 className={cn.h5}>{children}</o.h5>;
      }
      return <h5 className={c.h5}>{children}</h5>;
    },
    h6({ children }) {
      if (o.h6) {
        return <o.h6 className={cn.h6}>{children}</o.h6>;
      }
      return <h6 className={c.h6}>{children}</h6>;
    },
    input({ node: _node, type, checked, disabled, ...props }) {
      if (type === "checkbox") {
        if (o.checkbox) {
          return (
            <o.checkbox checked={Boolean(checked)} className={cn.checkbox} />
          );
        }
        return (
          <input
            type="checkbox"
            checked={Boolean(checked)}
            disabled
            aria-label={checked ? "Completed task" : "Incomplete task"}
            className={c.checkbox}
            readOnly
          />
        );
      }
      return (
        <input
          type={type}
          checked={checked}
          disabled={disabled}
          readOnly
          {...props}
        />
      );
    },
    a({ href, title, children }) {
      if (o.a) {
        return (
          <o.a href={href} title={title} className={cn.a}>
            {children}
          </o.a>
        );
      }
      return (
        <a
          href={href}
          title={title}
          target="_blank"
          rel="noopener noreferrer"
          className={c.a}
        >
          {children}
        </a>
      );
    },
    img({ node: _node, src, alt, title, className: _className, ...props }) {
      if (o.img) {
        const Image = o.img;
        return (
          <Image
            src={typeof src === "string" ? src : undefined}
            alt={alt}
            title={title}
            className={cn.img}
          />
        );
      }
      return (
        <img
          src={typeof src === "string" ? src : undefined}
          alt={alt}
          title={title}
          className={c.img}
          {...props}
        />
      );
    },
    hr() {
      if (o.hr) {
        return <o.hr className={cn.hr} />;
      }
      return <hr className={c.hr} />;
    },
    strong({ children }) {
      if (o.strong) {
        return <o.strong className={cn.strong}>{children}</o.strong>;
      }
      return <strong className={c.strong}>{children}</strong>;
    },
    em({ children }) {
      if (o.em) {
        return <o.em className={cn.em}>{children}</o.em>;
      }
      return <em className={c.em}>{children}</em>;
    },
    del({ children }) {
      if (o.del) {
        return <o.del className={cn.del}>{children}</o.del>;
      }
      return <del className={c.del}>{children}</del>;
    },
  };
}

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
  const prevSourceRef = useRef("");

  const markdownComponents = useMemo(
    () => buildComponents(classNames, components, highlighter),
    [classNames, components, highlighter],
  );

  // A block processor: repairs (closes partial tokens) then preprocesses LaTeX
  // for a single block, plus a cache of already-processed *stable* (sealed)
  // blocks keyed by their raw string. Both are rebuilt together whenever the
  // processing options change so stale results never leak. The order inside
  // `process` matters: `completePartialTokens` closes an unfinished `\[…` so
  // that `preprocessLaTeX` can then convert the now-complete `\[…\]` to `$$…$$`.
  const processor = useMemo(() => {
    const cache = new Map<string, string>();
    const process = (block: string): string => {
      const repaired = repairPartialTokens
        ? completePartialTokens(block, { showUnfinishedLatexBlocks })
        : block;
      return preprocessLaTeX(repaired);
    };
    return { cache, process };
  }, [repairPartialTokens, showUnfinishedLatexBlocks]);

  // With memoization, split the raw source into top-level blocks so only the
  // last (streaming) block is re-processed and re-rendered; stable blocks are
  // pulled from the cache. Streaming is append-only, so every block except the
  // last is sealed and never changes — caching them means a growing message
  // only repairs/preprocesses the last block each chunk instead of the whole
  // document. Without memoization the whole message is processed as one block,
  // which preserves cross-block constructs (footnotes, reference definitions).
  const blocks = useMemo(() => {
    if (source === "") {
      prevSourceRef.current = source;
      return [];
    }
    if (!source.startsWith(prevSourceRef.current)) {
      processor.cache.clear();
    }
    prevSourceRef.current = source;
    if (!blockMemoization) {
      return [processor.process(source)];
    }
    const rawBlocks = splitMarkdownBlocks(source);
    const lastIndex = rawBlocks.length - 1;
    return rawBlocks.map((raw, index) => {
      if (index === lastIndex) {
        // The streaming block changes every chunk; always process it fresh.
        return processor.process(raw);
      }
      let done = processor.cache.get(raw);
      if (done === undefined) {
        done = processor.process(raw);
        processor.cache.set(raw, done);
      }
      return done;
    });
  }, [source, blockMemoization, processor]);

  // Render the block list from a deferred copy of `blocks`. On a fast stream the
  // synchronous render keeps showing the previously-rendered blocks while React
  // reconciles the new (and heavier) block subtree at low priority, so a burst
  // of chunks coalesces instead of forcing a full synchronous re-parse/re-render
  // on every chunk. `useDeferredValue` does this without an effect or extra
  // state (so it can't loop), and the first render is immediate.
  //
  // Smooth reveal is the exception: it animates the active block per chunk and
  // needs the freshly-rendered blocks every frame. Deferring would let the
  // reveal wave reset (and `--llm-reveal` drop to 0) while a just-finished
  // block's fade spans are still mounted, making committed code blocks / lists /
  // blockquotes flicker. So when the reveal is on, render the current blocks
  // synchronously; the deferral is purely a throughput win for the common
  // non-animated case.
  const deferredBlocks = useDeferredValue(blocks);
  const renderedBlocks = smoothReveal ? blocks : deferredBlocks;

  const activeIndex = renderedBlocks.length - 1;
  const activeSource = renderedBlocks[activeIndex] ?? "";

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
