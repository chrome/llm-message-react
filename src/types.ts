import type { ComponentType, ReactNode } from "react";

/** Props passed to a custom fenced code block renderer. */
export interface CodeBlockProps {
  /** The raw code content (without the trailing newline). */
  code: string;
  /** The language detected from the fence info string (may be empty). */
  language: string;
  className?: string;
}

/** Props passed to a custom inline code renderer. */
export interface InlineCodeProps {
  className?: string;
  children?: ReactNode;
}

/** Props passed to a code-highlighter component. */
export interface CodeHighlighterProps {
  /** The raw code content (without the trailing newline). */
  code: string;
  /** The language detected from the fence info string (may be empty). */
  language: string;
  className?: string;
}

/** A component that renders a syntax-highlighted code body. */
export type CodeHighlighter = ComponentType<CodeHighlighterProps>;

/**
 * A `codeToHtml`-compatible function. The signature is shared by `shiki`,
 * `shiki/bundle/web`, and a `createHighlighterCore` instance's `codeToHtml`,
 * so any of them can be passed to `createShikiHighlighter`.
 */
export type CodeToHtml = (
  code: string,
  options: { lang: string; themes: { light: string; dark: string } },
) => string | Promise<string>;

/** Props passed to a custom copy button renderer. */
export interface CopyButtonProps {
  /** The text that should be written to the clipboard. */
  text: string;
  className?: string;
}

/** Props passed to a custom task-list checkbox renderer. */
export interface CheckboxProps {
  checked: boolean;
  className?: string;
}

/** Props passed to generic block/inline element overrides. */
export interface ElementProps {
  className?: string;
  children?: ReactNode;
}

/** Props passed to a custom anchor renderer. */
export interface AnchorProps extends ElementProps {
  href?: string;
}

/** Props passed to a custom image renderer. */
export interface ImageProps {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
}

/**
 * Per-element class overrides. Each value is merged with the built-in
 * semantic class name, so the default theme still applies unless overridden
 * via CSS.
 */
export interface LLMMessageClassNames {
  root?: string;
  p?: string;
  h1?: string;
  h2?: string;
  h3?: string;
  h4?: string;
  h5?: string;
  h6?: string;
  ul?: string;
  ol?: string;
  li?: string;
  code?: string;
  codeBlock?: string;
  codeHeader?: string;
  codeLanguage?: string;
  copyButton?: string;
  table?: string;
  tableWrapper?: string;
  th?: string;
  td?: string;
  blockquote?: string;
  a?: string;
  hr?: string;
  strong?: string;
  em?: string;
  del?: string;
  img?: string;
  checkbox?: string;
}

/**
 * Per-element component overrides. When provided, the user component fully
 * controls the markup for that element; otherwise the built-in native renderer
 * is used.
 */
export interface LLMMessageComponents {
  codeBlock?: ComponentType<CodeBlockProps>;
  code?: ComponentType<InlineCodeProps>;
  copyButton?: ComponentType<CopyButtonProps>;
  checkbox?: ComponentType<CheckboxProps>;
  a?: ComponentType<AnchorProps>;
  img?: ComponentType<ImageProps>;
  p?: ComponentType<ElementProps>;
  h1?: ComponentType<ElementProps>;
  h2?: ComponentType<ElementProps>;
  h3?: ComponentType<ElementProps>;
  h4?: ComponentType<ElementProps>;
  h5?: ComponentType<ElementProps>;
  h6?: ComponentType<ElementProps>;
  ul?: ComponentType<ElementProps>;
  ol?: ComponentType<ElementProps>;
  li?: ComponentType<ElementProps>;
  blockquote?: ComponentType<ElementProps>;
  table?: ComponentType<ElementProps>;
  th?: ComponentType<ElementProps>;
  td?: ComponentType<ElementProps>;
  hr?: ComponentType<ElementProps>;
  strong?: ComponentType<ElementProps>;
  em?: ComponentType<ElementProps>;
  del?: ComponentType<ElementProps>;
  pre?: ComponentType<ElementProps>;
}
