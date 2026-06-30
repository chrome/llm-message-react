# llm-message-react

A single React component that renders LLM markdown output the way a polished chat UI does:

- GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks)
- Math via KaTeX (inline `$...$` and block `$$...$$`, plus `\(...\)` / `\[...\]`)
- Code blocks with a language label and a copy button, plus **opt-in** [Shiki](https://shiki.style) syntax highlighting (you choose the bundle, so it tree-shakes away when unused)
- Streaming-aware: partial markdown/LaTeX tokens are repaired so half-streamed responses don't flash raw delimiter junk
- A built-in light/dark theme you can opt into, with full per-element class **and** component overrides

## Install

```bash
npm install llm-message-react
```

## Usage

```tsx
import { LLMMessage } from "llm-message-react";
import "llm-message-react/styles.css"; // built-in theme (optional)

export function Message({ content }: { content: string }) {
  return <LLMMessage>{content}</LLMMessage>;
}
```

`content` can be passed as children or via the `content` prop:

```tsx
<LLMMessage content={content} />
```

### Dark mode

The built-in theme switches automatically when an ancestor has the `dark` class (the convention used by Tailwind / shadcn), or when you put `dark` directly on the component:

```tsx
<LLMMessage className="dark">{content}</LLMMessage>
```

## Syntax highlighting

Highlighting is **off by default**: fenced code blocks still render with a language label and copy button, but the code body is plain text. Because the default path never imports Shiki, it tree-shakes out of your bundle entirely. You opt in by passing a `highlighter`, and you choose which Shiki bundle you pay for.

### 1. No highlighting (default)

```tsx
import { LLMMessage } from "llm-message-react";
import "llm-message-react/styles.css";

<LLMMessage>{content}</LLMMessage>;
```

### 2. Web bundle (smaller — common web languages)

Install `shiki` (an optional peer dependency) and import the ready-made highlighter from the `/shiki-web` subpath:

```tsx
import { LLMMessage } from "llm-message-react";
import { ShikiWebHighlighter } from "llm-message-react/shiki-web";
import "llm-message-react/styles.css";

<LLMMessage highlighter={ShikiWebHighlighter}>{content}</LLMMessage>;
```

### 3. Full bundle (all languages and themes)

```tsx
import { LLMMessage } from "llm-message-react";
import { ShikiHighlighter } from "llm-message-react/shiki";
import "llm-message-react/styles.css";

<LLMMessage highlighter={ShikiHighlighter}>{content}</LLMMessage>;
```

### 4. Custom languages / themes (smallest bundle)

Build a minimal Shiki core highlighter with only the grammars and themes you need, then wrap its `codeToHtml` with `createShikiHighlighter`. The factory itself imports no Shiki, so nothing extra is pulled in:

```tsx
import { LLMMessage, createShikiHighlighter } from "llm-message-react";
import "llm-message-react/styles.css";

import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

const core = await createHighlighterCore({
  langs: [
    import("shiki/langs/typescript.mjs"),
    import("shiki/langs/python.mjs"),
  ],
  themes: [
    import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
  ],
  engine: createOnigurumaEngine(import("shiki/wasm")),
});

const MyHighlighter = createShikiHighlighter(core.codeToHtml);

<LLMMessage highlighter={MyHighlighter}>{content}</LLMMessage>;
```

Notes:

- `createShikiHighlighter(codeToHtml, options?)` accepts any function with the signature `(code, { lang, themes: { light, dark } }) => string | Promise<string>`, so a synchronous core `codeToHtml` works too.
- Themes default to `github-light` / `github-dark`; override them with the second argument: `createShikiHighlighter(fn, { themes: { light: "vitesse-light", dark: "vitesse-dark" } })` (and load the matching themes in your core highlighter).
- If a streamed language isn't loaded, the highlighter falls back to plain code (same as on any highlight error).

## Streaming

`LLMMessage` repairs partially-streamed markdown/LaTeX by default, so unterminated tokens (`**bold`, `` `code ``, `[label](http`, `$E = mc^2`, `\[ ... `) don't flash as raw delimiters while a response streams in. Disable it with `completePartialTokens={false}`.

### Turn repair off once streaming is done

The repair only helps _while_ text is still arriving. On a finished message it can do harm: a single trailing `$` (or a stray `\`) that is really part of the content gets read as the start of an unterminated math token and "completed", so a final string like `Pay $12\at the door` is mistaken for LaTeX and mangled.

If you know when a message has finished streaming, gate `completePartialTokens` on that. Keep it `true` while streaming, then flip it to `false` once the stream closes so the final, complete text is rendered verbatim:

```tsx
import { useEffect, useState } from "react";
import { LLMMessage } from "llm-message-react";
import "llm-message-react/styles.css";

export function StreamedMessage({ messageId }: { messageId: string }) {
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(true);

  useEffect(() => {
    const stream = subscribeToMessage(messageId, {
      onToken: (token) => setContent((prev) => prev + token),
      onDone: () => setIsStreaming(false), // stream finished
    });
    return () => stream.close();
  }, [messageId]);

  // Repair partial tokens while streaming, render verbatim once done.
  return (
    <LLMMessage completePartialTokens={isStreaming}>{content}</LLMMessage>
  );
}
```

This way half-streamed tokens are still repaired mid-stream, but the completed message is never "fixed" into something it isn't.

### Unfinished block math

By default, unterminated **block** math (`\[ ... `, `$$ ... `) is rendered _progressively_: the open environments/braces are closed and the largest prefix KaTeX accepts is shown, so a long aligned block reveals itself row by row instead of popping in only once the closing delimiter arrives.

This convenience has a cost: it runs a synchronous KaTeX parse on every streamed chunk that contains an open block. If you stream many large math blocks and want to avoid that work, set `showUnfinishedLatexBlocks={false}`. Unfinished blocks are then hidden until their closing delimiter arrives (no KaTeX parsing happens for them mid-stream):

```tsx
<LLMMessage showUnfinishedLatexBlocks={false}>{content}</LLMMessage>
```

### Smooth reveal

By default new text pops in as each chunk arrives. Set `smoothReveal` to fade it in instead — character by character for prose, and as a single unit for complex blocks (code, tables, images, rules). Box decorations (a blockquote's border, list bullets, an inline-code background) fade in together with the content they belong to. Block math (`$$ … $$`, `\[ … \]`) is the one exception: KaTeX only produces output once the whole formula has streamed in, so a fade would just be a flash — instead the block appears instantly the moment the wave reaches it:

```tsx
<LLMMessage smoothReveal>{content}</LLMMessage>
```

The reveal is purely visual: text is always in the DOM the moment it streams in, it just eases up from transparent as a single travelling wave. The wave is sized so it sweeps through the not-yet-revealed text within a short window (`smoothRevealDuration`, default `300` ms). When a new chunk arrives while the previous one is still fading, the leftover (not-yet-revealed) characters and the new ones reveal together over one fresh window, so the animation stays a single coherent wave that keeps pace with the stream instead of many overlapping fades.

```tsx
<LLMMessage smoothReveal smoothRevealDuration={200}>
  {content}
</LLMMessage>
```

Opacity is computed purely from each character's position relative to the reveal point, so it only ever increases (no flicker) regardless of how the stream re-renders, and it is disabled automatically for users who prefer reduced motion.

### Block memoization

While a long message streams in, each new chunk would otherwise re-parse and re-render the entire message — re-running KaTeX and code highlighting over text that has not changed. By default `LLMMessage` splits the message into top-level markdown blocks (paragraphs, headings, code fences, math blocks, lists, tables, …) and memoizes each one, so only the last (currently growing) block re-renders on each chunk. Earlier blocks stay mounted and untouched, which keeps streaming smooth regardless of message length.

This is on by default and needs no configuration. The one trade-off is that constructs which resolve across blocks — footnotes and link reference definitions — cannot be split (a definition in one block could not be seen by a reference in another). Those are detected automatically and kept in a single block, but if you render content that relies on them and want to be certain, disable splitting:

```tsx
<LLMMessage blockMemoization={false}>{content}</LLMMessage>
```

The repair function is also exported if you need it directly, alongside the LaTeX preprocessing helpers:

```ts
import {
  completePartialTokens,
  preprocessLaTeX,
  escapeBrackets,
  escapeMhchem,
} from "llm-message-react";
```

## Theming

You have three independent ways to control the look, from lightest to fullest:

### 1. Built-in theme

Import the stylesheet once and you're done:

```ts
import "llm-message-react/styles.css";
```

It targets stable semantic class names (`llm-message`, `llm-p`, `llm-code`, `llm-code-block`, `llm-table`, `llm-blockquote`, `llm-a`, `llm-checkbox`, ...) and exposes CSS custom properties you can override:

```css
.llm-message {
  --llm-foreground: #1a1a1a;
  --llm-primary: #2563eb;
  --llm-muted: #f4f4f5;
  --llm-border: #e4e4e7;
  --llm-radius: 0.5rem;
}
```

### 2. `classNames` — restyle while keeping native elements

Pass per-element classes (Tailwind or your own). They are merged with the built-in class names, so you can extend or override:

```tsx
<LLMMessage
  className="prose"
  classNames={{
    p: "text-lg",
    codeBlock: "rounded-2xl shadow",
    a: "text-blue-500",
  }}
>
  {content}
</LLMMessage>
```

If you only use `classNames` / your own CSS, you can skip importing `styles.css` entirely.

### 3. `components` — replace the markup entirely

Override how any element is rendered with your own component. Everything not overridden falls back to the built-in native renderer.

```tsx
import { LLMMessage } from "llm-message-react";
import { MyCheckbox, MyCodeBlock, MyLink } from "./ui";

<LLMMessage
  components={{
    checkbox: ({ checked }) => <MyCheckbox checked={checked} />,
    codeBlock: ({ code, language }) => (
      <MyCodeBlock language={language}>{code}</MyCodeBlock>
    ),
    a: ({ href, children }) => <MyLink href={href}>{children}</MyLink>,
  }}
>
  {content}
</LLMMessage>;
```

## Props

- `children?: string` — the markdown content.
- `content?: string` — alias for `children`.
- `className?: string` — class for the root element (merged with `llm-message`).
- `classNames?: LLMMessageClassNames` — per-element class overrides (look only).
- `components?: LLMMessageComponents` — per-element component overrides (full markup control).
- `highlighter?: CodeHighlighter` — opt-in syntax highlighter for fenced code blocks (see [Syntax highlighting](#syntax-highlighting)). Omitted by default, so no highlighter bundle is pulled in.
- `completePartialTokens?: boolean` — repair partially-streamed markdown/LaTeX. Defaults to `true`.
- `showUnfinishedLatexBlocks?: boolean` — progressively render unterminated block math while it streams (costs a synchronous KaTeX parse per chunk); set to `false` to hide unfinished blocks until they close and skip that work. Defaults to `true`. Only relevant while `completePartialTokens` is enabled.
- `smoothReveal?: boolean` — fade newly-streamed text in (per character for prose, whole-unit for code/tables/images; block math snaps in instantly since it can't fade progressively) instead of popping it in. Purely visual and respects `prefers-reduced-motion`. Defaults to `false`.
- `smoothRevealDuration?: number` — reveal window in milliseconds for each freshly-arrived chunk. Defaults to `300`. Only relevant while `smoothReveal` is enabled.
- `blockMemoization?: boolean` — split the message into top-level blocks and memoize each so a streaming chunk only re-renders the last block (see [Block memoization](#block-memoization)). Defaults to `true`.
- All other `div` props are spread onto the root element.

> Pass stable references for `classNames`, `components`, and `highlighter` (define them outside render or memoize them). They are dependencies of an internal `useMemo`, so new object/identity on every render defeats it.

## Known limitations

- **Currency vs. inline math with a leading digit.** A `$` directly before a digit is treated as currency and escaped (so `$5` renders literally). This means inline math that starts with a digit, e.g. `$5x$`, is ambiguous and may be escaped rather than rendered as math. Use `\( ... \)` (or `$$ ... $$`) for such expressions.
- **KaTeX stylesheet import.** `llm-message-react/styles.css` starts with `@import "katex/dist/katex.min.css";`. This resolves automatically with bundlers that handle bare CSS imports (Vite, webpack + css-loader, etc.). If you load the stylesheet via a plain `<link>` instead, import KaTeX's CSS separately.

## License

MIT
