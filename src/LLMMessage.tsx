import { clsx } from "clsx";
import { useMemo } from "react";
import type { HTMLAttributes } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { completePartialTokens } from "./completePartialTokens";
import { CopyButton } from "./CopyButton";
import { preprocessLaTeX } from "./preprocess";
import type {
  CodeHighlighter,
  LLMMessageClassNames,
  LLMMessageComponents,
} from "./types";

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
   * Optional syntax highlighter for fenced code blocks. When omitted, code
   * blocks render as plain text (so no highlighter bundle is pulled in). Pass
   * `ShikiHighlighter` / `ShikiWebHighlighter`, or build your own with
   * `createShikiHighlighter`.
   */
  highlighter?: CodeHighlighter;
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

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
          <div className={cx("llm-code-block", cn.codeBlock)}>
            <div className={cx("llm-code-header", cn.codeHeader)}>
              <span className={cx("llm-code-language", cn.codeLanguage)}>
                {language}
              </span>
              {o.copyButton ? (
                <o.copyButton text={codeText} className={cn.copyButton} />
              ) : (
                <CopyButton
                  text={codeText}
                  className={cx("llm-copy-button", cn.copyButton)}
                />
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
          <InlineCode className={cx("llm-code", cn.code, className)}>
            {children}
          </InlineCode>
        );
      }

      return (
        <code className={cx("llm-code", cn.code, className)} {...props}>
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
        <div className={cx("llm-table-wrapper", cn.tableWrapper)}>
          <table className={cx("llm-table", cn.table)}>{children}</table>
        </div>
      );
    },
    th({ children, style }) {
      if (o.th) {
        return <o.th className={cn.th}>{children}</o.th>;
      }
      return (
        <th className={cx("llm-th", cn.th)} style={style}>
          {children}
        </th>
      );
    },
    td({ children, style }) {
      if (o.td) {
        return <o.td className={cn.td}>{children}</o.td>;
      }
      return (
        <td className={cx("llm-td", cn.td)} style={style}>
          {children}
        </td>
      );
    },
    blockquote({ children }) {
      if (o.blockquote) {
        return <o.blockquote className={cn.blockquote}>{children}</o.blockquote>;
      }
      return (
        <blockquote className={cx("llm-blockquote", cn.blockquote)}>
          {children}
        </blockquote>
      );
    },
    ul({ children }) {
      if (o.ul) {
        return <o.ul className={cn.ul}>{children}</o.ul>;
      }
      return <ul className={cx("llm-ul", cn.ul)}>{children}</ul>;
    },
    ol({ children }) {
      if (o.ol) {
        return <o.ol className={cn.ol}>{children}</o.ol>;
      }
      return <ol className={cx("llm-ol", cn.ol)}>{children}</ol>;
    },
    li({ children }) {
      if (o.li) {
        return <o.li className={cn.li}>{children}</o.li>;
      }
      return <li className={cx("llm-li", cn.li)}>{children}</li>;
    },
    p({ children }) {
      if (o.p) {
        return <o.p className={cn.p}>{children}</o.p>;
      }
      return <p className={cx("llm-p", cn.p)}>{children}</p>;
    },
    h1({ children }) {
      if (o.h1) {
        return <o.h1 className={cn.h1}>{children}</o.h1>;
      }
      return <h1 className={cx("llm-h1", cn.h1)}>{children}</h1>;
    },
    h2({ children }) {
      if (o.h2) {
        return <o.h2 className={cn.h2}>{children}</o.h2>;
      }
      return <h2 className={cx("llm-h2", cn.h2)}>{children}</h2>;
    },
    h3({ children }) {
      if (o.h3) {
        return <o.h3 className={cn.h3}>{children}</o.h3>;
      }
      return <h3 className={cx("llm-h3", cn.h3)}>{children}</h3>;
    },
    h4({ children }) {
      if (o.h4) {
        return <o.h4 className={cn.h4}>{children}</o.h4>;
      }
      return <h4 className={cx("llm-h4", cn.h4)}>{children}</h4>;
    },
    h5({ children }) {
      if (o.h5) {
        return <o.h5 className={cn.h5}>{children}</o.h5>;
      }
      return <h5 className={cx("llm-h5", cn.h5)}>{children}</h5>;
    },
    h6({ children }) {
      if (o.h6) {
        return <o.h6 className={cn.h6}>{children}</o.h6>;
      }
      return <h6 className={cx("llm-h6", cn.h6)}>{children}</h6>;
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
            className={cx("llm-checkbox", cn.checkbox)}
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
          className={cx("llm-a", cn.a)}
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
          className={cx("llm-img", cn.img)}
          {...props}
        />
      );
    },
    hr() {
      if (o.hr) {
        return <o.hr className={cn.hr} />;
      }
      return <hr className={cx("llm-hr", cn.hr)} />;
    },
    strong({ children }) {
      if (o.strong) {
        return <o.strong className={cn.strong}>{children}</o.strong>;
      }
      return <strong className={cx("llm-strong", cn.strong)}>{children}</strong>;
    },
    em({ children }) {
      if (o.em) {
        return <o.em className={cn.em}>{children}</o.em>;
      }
      return <em className={cx("llm-em", cn.em)}>{children}</em>;
    },
    del({ children }) {
      if (o.del) {
        return <o.del className={cn.del}>{children}</o.del>;
      }
      return <del className={cx("llm-del", cn.del)}>{children}</del>;
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
  highlighter,
  ...rest
}: LLMMessageProps) {
  const source = content ?? children ?? "";

  const markdownComponents = useMemo(
    () => buildComponents(classNames, components, highlighter),
    [classNames, components, highlighter],
  );

  const processed = useMemo(() => {
    const repaired = repairPartialTokens
      ? completePartialTokens(source, { showUnfinishedLatexBlocks })
      : source;
    return preprocessLaTeX(repaired);
  }, [source, repairPartialTokens, showUnfinishedLatexBlocks]);

  return (
    <div className={cx("llm-message", classNames?.root, className)} {...rest}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
