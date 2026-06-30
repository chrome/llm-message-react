import type { Element, ElementContent, Root, Text } from "hast";

/**
 * Shared, mutable state for the smooth-reveal rehype plugin. Lives in a ref on
 * the component so it survives re-renders. `committedUnits` is the number of
 * leading reveal units that are already fully shown; they render as plain
 * markup (no span) so the per-character DOM stays bounded to the active wave.
 */
export interface SmoothRevealState {
  committedUnits: number;
}

export interface FadeRehypePluginOptions {
  state: SmoothRevealState;
  /** Called once per transform with the total reveal-unit count. */
  onTotal: (total: number) => void;
}

const CHAR_CLASS = "llm-char";
const FADE_CLASS = "llm-fade";
const BLOCK_CLASS = "llm-fade-block";
const BLOCK_INLINE_CLASS = "llm-fade-block-inline";
/**
 * Block math renders all-or-nothing (KaTeX only produces output once the whole
 * formula has streamed in), so a soft opacity fade just looks like a flash.
 * These blocks are tagged to appear instantly the moment the wave reaches them
 * instead of fading.
 */
const BLOCK_SNAP_CLASS = "llm-fade-block-snap";

/** Tags whose entire subtree fades in as a single unit (wrapped in a div). */
const BLOCK_TAGS = new Set(["pre", "table", "hr"]);

/**
 * Tags that carry their own box decoration (a border, marker, or background)
 * but still contain flowing text we want to reveal per-character. We tag the
 * element itself with the reveal index of its first child so the decoration
 * fades in with the wave, then descend so the text inside still streams in
 * letter by letter. `code` here is always inline code (block code lives inside
 * a `pre`, which is a complex unit we never descend into).
 */
const DECORATED_TAGS = new Set(["blockquote", "li", "code"]);

function hasClass(node: Element, name: string): boolean {
  const className = node.properties?.className;
  if (Array.isArray(className)) {
    return className.includes(name);
  }
  return typeof className === "string" && className.split(/\s+/).includes(name);
}

function isComplexElement(node: Element): boolean {
  return (
    BLOCK_TAGS.has(node.tagName) ||
    node.tagName === "img" ||
    // KaTeX output (rehype-katex). `katex-display` is the block wrapper; a bare
    // `katex` is inline math. Either way we fade the whole formula as one unit.
    hasClass(node, "katex-display") ||
    hasClass(node, "katex")
  );
}

/**
 * A rehype plugin factory that wraps newly-streamed rendered text in
 * per-character `<span>`s (and complex blocks in a single wrapper) and tags
 * each with its document-order index via a `--i` custom property. The actual
 * fade is computed in CSS from `--i` and a single `--llm-reveal` position that
 * the component advances over time, so the opacity of every unit is a pure
 * function of state: re-parses of the streaming source never cause a flicker.
 */
export function createFadeRehypePlugin(options: FadeRehypePluginOptions) {
  const { state, onTotal } = options;

  return function fadeRehypePlugin() {
    return (tree: Root): void => {
      const counter = { unit: 0 };

      const makeFadeBlock = (
        node: Element,
        inline: boolean,
        index: number,
        snap = false,
      ): Element => {
        const className = inline
          ? [BLOCK_CLASS, BLOCK_INLINE_CLASS]
          : snap
            ? [BLOCK_CLASS, BLOCK_SNAP_CLASS]
            : [BLOCK_CLASS];
        return {
          type: "element",
          tagName: inline ? "span" : "div",
          properties: {
            className,
            style: `--i:${index}`,
          },
          children: [node],
        };
      };

      const processText = (node: Text): ElementContent[] => {
        // Leave structural whitespace untouched. Markdown places whitespace-only
        // text nodes (e.g. newlines) between block siblings such as the `<li>`s
        // of a list. A flex/grid container ignores such a text node, but wrapping
        // it in a `<span>` turns it into a real (element) flex item that adds a
        // phantom `gap`, so the container is one gap taller while animating and
        // snaps back once the spans are committed to plain text. These nodes
        // carry no visible glyph, so there is nothing to fade anyway.
        if (/^\s*$/.test(node.value)) {
          return [node];
        }
        const chars = Array.from(node.value);
        const out: ElementContent[] = [];
        let plain = "";

        const flushPlain = () => {
          if (plain) {
            out.push({ type: "text", value: plain });
            plain = "";
          }
        };

        for (const ch of chars) {
          const index = counter.unit++;
          if (index < state.committedUnits) {
            plain += ch;
            continue;
          }
          flushPlain();
          out.push({
            type: "element",
            tagName: "span",
            properties: { className: [CHAR_CLASS], style: `--i:${index}` },
            children: [{ type: "text", value: ch }],
          });
        }

        flushPlain();
        return out;
      };

      const processComplex = (node: Element): ElementContent => {
        const index = counter.unit++;
        if (index < state.committedUnits) {
          // Already revealed: render verbatim so the DOM stays minimal.
          return node;
        }
        const inline = node.tagName === "img" || hasClass(node, "katex");
        // Block math (`katex-display`) appears instantly rather than fading.
        const snap = hasClass(node, "katex-display");
        return makeFadeBlock(node, inline, index, snap);
      };

      const stampDecoration = (node: Element, index: number): void => {
        const className = node.properties?.className;
        const classes = Array.isArray(className)
          ? className.map(String)
          : typeof className === "string"
            ? className.split(/\s+/).filter(Boolean)
            : [];
        classes.push(FADE_CLASS);
        node.properties = {
          ...node.properties,
          className: classes,
          style: `--i:${index}`,
        };
      };

      const processChildren = (parent: Root | Element): void => {
        const next: ElementContent[] = [];
        for (const child of parent.children) {
          if (child.type === "text") {
            next.push(...processText(child));
          } else if (child.type === "element") {
            if (isComplexElement(child)) {
              next.push(processComplex(child));
            } else {
              if (DECORATED_TAGS.has(child.tagName)) {
                // Tag with the index of the first unit inside so the box
                // decoration fades in with the content; do not consume a unit.
                stampDecoration(child, counter.unit);
              }
              processChildren(child);
              next.push(child);
            }
          } else {
            // Comments / doctype / raw: keep as-is, no reveal unit.
            next.push(child as ElementContent);
          }
        }
        parent.children = next;
      };

      processChildren(tree);
      onTotal(counter.unit);
    };
  };
}
