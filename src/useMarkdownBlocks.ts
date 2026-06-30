import { useDeferredValue, useMemo, useRef } from "react";

import { completePartialTokens } from "./completePartialTokens";
import { preprocessLaTeX } from "./preprocess";
import { splitMarkdownBlocks } from "./splitBlocks";

export interface UseMarkdownBlocksOptions {
  /** Raw markdown source. */
  source: string;
  /**
   * Split into top-level blocks and cache stable (sealed) ones, or process the
   * whole message as a single block.
   */
  blockMemoization: boolean;
  /** Repair partially-streamed markdown/LaTeX before preprocessing. */
  repairPartialTokens: boolean;
  /** Show unfinished block math while streaming (only when repairing). */
  showUnfinishedLatexBlocks: boolean;
  /**
   * When enabled, render blocks synchronously so smooth reveal can animate the
   * active block every chunk; otherwise defer reconciliation for throughput.
   */
  smoothReveal: boolean;
}

export interface UseMarkdownBlocksResult {
  /** Processed blocks ready for rendering (possibly deferred). */
  renderedBlocks: string[];
  /** Index of the active (currently streaming) block. */
  activeIndex: number;
  /** Processed source of the active block. */
  activeSource: string;
}

/**
 * Splits the raw source into top-level markdown blocks, repairs partial tokens
 * and preprocesses LaTeX per block, and caches stable blocks so streaming only
 * re-processes the last (growing) block.
 */
export function useMarkdownBlocks({
  source,
  blockMemoization,
  repairPartialTokens,
  showUnfinishedLatexBlocks,
  smoothReveal,
}: UseMarkdownBlocksOptions): UseMarkdownBlocksResult {
  const prevSourceRef = useRef("");

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

  return { renderedBlocks, activeIndex, activeSource };
}
