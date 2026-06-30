import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import { createFadeRehypePlugin, type SmoothRevealState } from "./smoothReveal";

/** The rehype plugin produced by {@link createFadeRehypePlugin}. */
type FadePlugin = ReturnType<typeof createFadeRehypePlugin>;

// Run the wave synchronously after commit but before paint, so the
// `--llm-reveal` variable is only ever written to a freshly-committed tree
// (never to the previous, still-mounted tree during render). On the server
// there is no layout to flush, so fall back to a passive effect to avoid the
// React "useLayoutEffect does nothing on the server" warning.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Width of the smooth-reveal fade gradient, in reveal units (characters). A
// larger value spreads each fade over more neighbouring characters for a softer
// trailing edge. Shared with the CSS `--llm-ramp` fallback.
const SMOOTH_RAMP = 6;

export interface UseSmoothRevealOptions {
  /**
   * The markdown source of the *active* (currently streaming) block; its growth
   * is what drives the reveal wave. With block memoization this is the last
   * block; without it, the whole message.
   */
  activeSource: string;
  /**
   * Identity of the active block (its index). When it changes a new block has
   * started streaming, so the wave resets and animates the new block from its
   * own start.
   */
  activeKey: number;
  /** Whether smooth rendering is enabled. */
  enabled: boolean;
  /** Reveal window for a freshly-arrived chunk, in milliseconds. */
  duration: number;
}

export interface UseSmoothRevealResult {
  /** Attach to the rendered root element; the wave position is set on it. */
  rootRef: RefObject<HTMLDivElement | null>;
  /**
   * The smooth-reveal rehype plugin to attach to the active block, or `null`
   * when smooth reveal is disabled. KaTeX is composed separately by the caller
   * so it runs only on blocks that actually contain math.
   */
  fadePlugin: FadePlugin | null;
  /** Extra CSS custom properties to spread onto the root, or `undefined`. */
  revealStyle: CSSProperties | undefined;
}

/**
 * Drives the smooth character-by-character reveal of the active block.
 *
 * The opacity of every reveal unit is computed in CSS from its `--i` index and
 * a single `--llm-reveal` position on the root. That position is a float in unit
 * space that only ever moves forward, so the reveal is monotonic and never
 * flickers even as `react-markdown` re-parses the growing source. A new chunk
 * re-targets the position and recomputes the speed from the *current* position,
 * which merges any unfinished leftover into the new chunk's wave over one fresh
 * `duration` window. Units the wave has already passed are committed to plain
 * markup so the live per-character DOM stays bounded to the active wave.
 *
 * Only the active block carries the fade plugin, so its reveal indices are
 * local to that block (they restart at 0). When the active block changes the
 * wave resets so the new block animates from its own start, while the
 * just-finished block flips to plain markup.
 */
export function useSmoothReveal({
  activeSource,
  activeKey,
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
  const activeKeyRef = useRef(activeKey);
  const snapRef = useRef(false);
  const [, forceCommit] = useState(0);

  const setRevealVar = (value: number) => {
    rootRef.current?.style.setProperty("--llm-reveal", String(value));
  };

  // A new active block began streaming: reset the wave so the new block reveals
  // from its own start (its reveal indices restart at 0) instead of being
  // treated as a wholesale content replacement (which would snap it visible).
  // Only refs are touched here; `--llm-reveal` is written from the layout effect
  // after commit so a reset can never blank out the just-finished block's fade
  // spans (which are still mounted until React commits the new tree).
  if (enabled && activeKey !== activeKeyRef.current) {
    activeKeyRef.current = activeKey;
    positionRef.current = 0;
    targetRef.current = 0;
    velocityRef.current = 0;
    revealStateRef.current.committedUnits = 0;
    prevSourceRef.current = "";
    snapRef.current = false;
  }

  // Only genuine appends animate. When the content shrinks (e.g. scrubbing
  // backwards) or is replaced wholesale, there is no newly-streamed text, so we
  // reveal everything instantly with no animation: render every unit as plain
  // markup this pass and snap the wave to the end in the effect below. For an
  // append we just advance the committed boundary so units the wave has already
  // passed render as plain markup. Done during render so the plugin sees the
  // correct state on this same pass; it is idempotent for a given source.
  if (enabled) {
    const isAppend = activeSource.startsWith(prevSourceRef.current);
    if (isAppend) {
      const safe = Math.floor(positionRef.current) - SMOOTH_RAMP;
      if (safe > revealStateRef.current.committedUnits) {
        revealStateRef.current.committedUnits = safe;
      }
    } else {
      // Content shrank or was replaced: render every unit as plain markup this
      // pass (committed boundary past the end) so there are no fade spans, and
      // let the layout effect snap `--llm-reveal` to the end after commit.
      snapRef.current = true;
      revealStateRef.current.committedUnits = Number.MAX_SAFE_INTEGER;
    }
    prevSourceRef.current = activeSource;
  }

  const fadePlugin = useMemo<FadePlugin | null>(() => {
    if (!enabled) {
      return null;
    }
    return createFadeRehypePlugin({
      state: revealStateRef.current,
      onTotal: (total) => {
        totalRef.current = total;
      },
    });
  }, [enabled]);

  // Drive `--llm-reveal` toward the end of the active block. Runs after commit
  // but before paint (layout effect) so the variable is written to the just
  // committed tree, never to the previous one during render. Re-runs on every
  // chunk (and when the active block changes) so the target/speed are
  // recomputed from the *current* position, which is what merges any unfinished
  // leftover into the new chunk's reveal wave.
  useIsomorphicLayoutEffect(() => {
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

    // Reflect the current wave position on the freshly-committed tree before the
    // browser paints. After an active-block change the position was reset to 0,
    // so this keeps the new block hidden (rather than flashing fully visible for
    // one frame before the animation's first rAF tick lowers it).
    setRevealVar(positionRef.current);

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
  }, [activeSource, activeKey, enabled, duration]);

  const revealStyle: CSSProperties | undefined = enabled
    ? ({ "--llm-ramp": String(SMOOTH_RAMP) } as CSSProperties)
    : undefined;

  return { rootRef, fadePlugin, revealStyle };
}
