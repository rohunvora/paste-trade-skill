/**
 * Drop-in replacement for console.error that also pushes to the live page.
 *
 * Usage:
 *   import { streamLog } from "./stream-log";
 *   streamLog("Uploading audio...");
 *   // → logs to stderr AND pushes a "thought" event to the live page
 *
 *   streamLog("Found: CL (hyperliquid perps)", { thesisId: "abc-123" });
 *   // → same, but also pushes "thesis_progress" so the card updates
 *
 * Caches stream context on first call. Fire-and-forget push (no await).
 * Falls back to stderr-only if no run context is available.
 *
 * For structured events (thesis_saved, thesis_routed, trade_posted),
 * keep using pushEvent() directly — those trigger specific UI animations.
 * streamLog() is for progress narration between those moments.
 */

import { getStreamContext, pushEvent } from "./stream-context";

let cachedCtx: { source_id: string; run_id: string } | null | undefined;

interface StreamLogOptions {
  thesisId?: string;
}

/**
 * Log a message to stderr and push it to the live page.
 *
 * Without thesisId: pushes a "thought" breadcrumb (global status log).
 * With thesisId: pushes "thesis_progress" (updates the specific card)
 *   AND a "thought" breadcrumb (so the global log stays complete).
 */
export function streamLog(message: string, opts?: StreamLogOptions): void {
  console.error(message);

  // Resolve context on first call, cache for subsequent calls
  if (cachedCtx === undefined) {
    const ctx = getStreamContext();
    cachedCtx = ctx ? { source_id: ctx.source_id, run_id: ctx.run_id } : null;
  }

  if (!cachedCtx) return;

  const { source_id, run_id } = cachedCtx;

  if (opts?.thesisId) {
    // Per-thesis progress: update the card + global breadcrumb
    pushEvent(source_id, "thesis_progress", {
      thesis_id: opts.thesisId,
      message,
    }, { runId: run_id }).catch(() => {});
  } else {
    // Global breadcrumb only
    pushEvent(source_id, "thought", { message }, { runId: run_id })
      .catch(() => {});
  }
}
