import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { Options } from "react-markdown";
import rehypeKatex from "rehype-katex";

import { createFadeRehypePlugin, type SmoothRevealState } from "./smoothReveal";

type RehypePlugins = Options["rehypePlugins"];

const baseRehypePlugins: RehypePlugins = [rehypeKatex];

// Width of the smooth-reveal fade gradient, in reveal units (characters). A
// larger value spreads each fade over more neighbouring characters for a softer
// trailing edge. Shared with the CSS `--llm-ramp` fallback.
const SMOOTH_RAMP = 6;

export interface UseSmoothRevealOptions {
  /** The raw markdown source; growth of this string is what drives the wave. */
  source: string;
  /** Whether smooth rendering is enabled. */
  enabled: boolean;
  /** Reveal window for a freshly-arrived chunk, in milliseconds. */
  duration: number;
}

export interface UseSmoothRevealResult {
  /** Attach to the rendered root element; the wave position is set on it. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Rehype plugins to feed `react-markdown` (KaTeX, plus the fade plugin). */
  rehypePlugins: RehypePlugins;
  /** Extra CSS custom properties to spread onto the root, or `undefined`. */
  revealStyle: CSSProperties | undefined;
}

/**
 * Drives the smooth character-by-character reveal.
 *
 * The opacity of every reveal unit is computed in CSS from its `--i` index and
 * a single `--llm-reveal` position. That position is a float in unit space that
 * only ever moves forward, so the reveal is monotonic and never flickers even
 * as `react-markdown` re-parses the growing source. A new chunk re-targets the
 * position and recomputes the speed from the *current* position, which merges
 * any unfinished leftover into the new chunk's wave over one fresh `duration`
 * window. Units the wave has already passed are committed to plain markup so
 * the live per-character DOM stays bounded to the active wave.
 */
export function useSmoothReveal({
  source,
  enabled,
  duration,
}: UseSmoothRevealOptions): UseSmoothRevealResult {
  const rootRef = useRef<HTMLDivElement>(null);
  const revealStateRef = useRef<SmoothRevealState>({ committedUnits: 0 });
  const positionRef = useRef(0);
  const targetRef = useRef(0);
  const velocityRef = useRef(0);
  const totalRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const prevSourceRef = useRef("");
  const snapRef = useRef(false);
  const [, forceCommit] = useState(0);

  const setRevealVar = (value: number) => {
    rootRef.current?.style.setProperty("--llm-reveal", String(value));
  };

  // Only genuine appends animate. When the content shrinks (e.g. scrubbing
  // backwards) or is replaced wholesale, there is no newly-streamed text, so we
  // reveal everything instantly with no animation: render every unit as plain
  // markup this pass and snap the wave to the end in the effect below. For an
  // append we just advance the committed boundary so units the wave has already
  // passed render as plain markup. Done during render so the plugin sees the
  // correct state on this same pass; it is idempotent for a given `source`.
  if (enabled) {
    const isAppend = source.startsWith(prevSourceRef.current);
    if (isAppend) {
      const safe = Math.floor(positionRef.current) - SMOOTH_RAMP;
      if (safe > revealStateRef.current.committedUnits) {
        revealStateRef.current.committedUnits = safe;
      }
    } else {
      snapRef.current = true;
      revealStateRef.current.committedUnits = Number.MAX_SAFE_INTEGER;
      setRevealVar(Number.MAX_SAFE_INTEGER);
    }
    prevSourceRef.current = source;
  }

  const rehypePlugins = useMemo<RehypePlugins>(() => {
    if (!enabled) {
      return baseRehypePlugins;
    }
    const fade = createFadeRehypePlugin({
      state: revealStateRef.current,
      onTotal: (total) => {
        totalRef.current = total;
      },
    });
    return [rehypeKatex, fade];
  }, [enabled]);

  // Drive `--llm-reveal` toward the end of the content. Re-runs on every chunk
  // so the target/speed are recomputed from the *current* position, which is
  // what merges any unfinished leftover into the new chunk's reveal wave.
  useEffect(() => {
    if (!enabled) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const total = totalRef.current;

    // Content shrank or was replaced: there is nothing new to animate, so snap
    // the wave to the end and normalise the committed boundary back to the real
    // unit count so subsequent appends animate from there.
    if (snapRef.current) {
      snapRef.current = false;
      const end = total + SMOOTH_RAMP;
      positionRef.current = end;
      targetRef.current = end;
      velocityRef.current = 0;
      revealStateRef.current.committedUnits = total;
      setRevealVar(end);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Reveal one ramp past the last unit so the final character reaches full
    // opacity rather than stopping mid-fade.
    targetRef.current = total + SMOOTH_RAMP;

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const finishImmediately =
      reduceMotion ||
      duration <= 0 ||
      typeof requestAnimationFrame !== "function";

    if (finishImmediately) {
      positionRef.current = targetRef.current;
      setRevealVar(positionRef.current);
      if (revealStateRef.current.committedUnits !== total) {
        revealStateRef.current.committedUnits = total;
        forceCommit((n) => n + 1);
      }
      return;
    }

    velocityRef.current = (targetRef.current - positionRef.current) / duration;
    lastTsRef.current = performance.now();

    const tick = (ts: number) => {
      const dt = Math.max(0, ts - lastTsRef.current);
      lastTsRef.current = ts;
      let next = positionRef.current + velocityRef.current * dt;
      if (next >= targetRef.current) {
        next = targetRef.current;
        positionRef.current = next;
        setRevealVar(next);
        rafRef.current = null;
        // The wave has caught up: collapse the spans back to plain markup.
        if (revealStateRef.current.committedUnits !== totalRef.current) {
          revealStateRef.current.committedUnits = totalRef.current;
          forceCommit((n) => n + 1);
        }
        return;
      }
      positionRef.current = next;
      setRevealVar(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [source, enabled, duration]);

  const revealStyle: CSSProperties | undefined = enabled
    ? ({ "--llm-ramp": String(SMOOTH_RAMP) } as CSSProperties)
    : undefined;

  return { rootRef, rehypePlugins, revealStyle };
}
