/**
 * /paste-signin — sign in to paste.trade from the CLI.
 *
 * 1. Reads API key from env
 * 2. Calls POST /api/auth/session-link → gets a one-time sign-in URL
 * 3. Opens the URL in the default browser
 * 4. User is signed in automatically — same identity, same trades
 */

import { loadKey, getBaseUrl } from "./ensure-key";
import { openUrlInBrowser } from "./browser";

export async function signIn(): Promise<string> {
  const apiKey = loadKey("PASTE_TRADE_KEY");
  if (!apiKey) {
    return "No API key found. Run /trade first to set up your account, then run /paste-signin to sign in.";
  }

  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/api/auth/session-link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } })) as any;
    return `Failed to create sign-in link: ${err?.error?.message ?? res.statusText}`;
  }

  const result = await res.json() as { url: string; expires_in: number };

  // Open in browser
  openUrlInBrowser(result.url);

  return [
    `Opening paste.trade... you'll be signed in momentarily.`,
    ``,
    `URL: ${result.url}`,
    `Expires in ${Math.floor(result.expires_in / 60)} minutes.`,
  ].join("\n");
}

// ── CLI entrypoint ──────────────────────────────────────────────────

if (import.meta.main) {
  signIn().then(msg => {
    console.log(msg);
  }).catch(err => {
    console.error("[paste-signin] Error:", err.message);
    process.exit(1);
  });
}
