import { clsx } from "clsx";
import type { Components } from "react-markdown";

import { CopyButton } from "./CopyButton";
import type {
  CodeHighlighter,
  LLMMessageClassNames,
  LLMMessageComponents,
} from "./types";

export function cx(...inputs: Array<string | undefined>): string | undefined {
  const result = clsx(inputs);
  return result === "" ? undefined : result;
}

export function buildMarkdownComponents(
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
    // Code — inline and fenced blocks.
    code: cx("llm-code", cn.code),
    codeBlock: cx("llm-code-block", cn.codeBlock),
    codeHeader: cx("llm-code-header", cn.codeHeader),
    codeLanguage: cx("llm-code-language", cn.codeLanguage),
    copyButton: cx("llm-copy-button", cn.copyButton),

    // Tables — wrapper, table shell, and cells.
    tableWrapper: cx("llm-table-wrapper", cn.tableWrapper),
    table: cx("llm-table", cn.table),
    th: cx("llm-th", cn.th),
    td: cx("llm-td", cn.td),

    // Blockquote.
    blockquote: cx("llm-blockquote", cn.blockquote),

    // Lists — ordered, unordered, items, and GFM task checkboxes.
    ul: cx("llm-ul", cn.ul),
    ol: cx("llm-ol", cn.ol),
    li: cx("llm-li", cn.li),
    checkbox: cx("llm-checkbox", cn.checkbox),

    // Paragraph.
    p: cx("llm-p", cn.p),

    // Headings — h1 through h6.
    h1: cx("llm-h1", cn.h1),
    h2: cx("llm-h2", cn.h2),
    h3: cx("llm-h3", cn.h3),
    h4: cx("llm-h4", cn.h4),
    h5: cx("llm-h5", cn.h5),
    h6: cx("llm-h6", cn.h6),

    // Links and media.
    a: cx("llm-a", cn.a),
    img: cx("llm-img", cn.img),

    // Horizontal rule.
    hr: cx("llm-hr", cn.hr),

    // Inline emphasis — bold, italic, strikethrough.
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
    // --- Code: inline `code` and fenced ``` blocks (pre is a passthrough). ---
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

    // --- Tables: scrollable wrapper, shell, header and body cells. ---
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

    // --- Blockquote. ---
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

    // --- Lists: ordered, unordered, items, and GFM task checkboxes. ---
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

    // --- Paragraph. ---
    p({ children }) {
      if (o.p) {
        return <o.p className={cn.p}>{children}</o.p>;
      }
      return <p className={c.p}>{children}</p>;
    },

    // --- Headings: h1 through h6. ---
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

    // --- Links and media. ---
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

    // --- Horizontal rule. ---
    hr() {
      if (o.hr) {
        return <o.hr className={cn.hr} />;
      }
      return <hr className={c.hr} />;
    },

    // --- Inline emphasis: bold, italic, strikethrough. ---
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
