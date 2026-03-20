import { spawn } from "child_process";
import { isIP } from "net";
import { relative, resolve } from "path";

const DEFAULT_BASE_URL = "https://paste.trade";

function isPrivateIp(hostname: string): boolean {
  if (isIP(hostname) === 0) return false;
  const lower = hostname.toLowerCase();

  // IPv6 local/link-local/loopback
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  // IPv4 private/link-local/loopback ranges
  const parts = hostname.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function hasForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    isPrivateIp(h)
  );
}

export function parseSafeExternalUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (hasForbiddenHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function normalizeTrustedBaseUrl(
  configured?: string,
): { baseUrl: string; trusted: boolean; reason?: string } {
  const candidate = (configured ?? "").trim() || DEFAULT_BASE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return { baseUrl: parsed.origin, trusted: true };
    }
    return {
      baseUrl: candidate,
      trusted: false,
      reason: `Invalid base URL "${candidate}" blocked. Only http/https are allowed.`,
    };
  } catch {
    return {
      baseUrl: candidate,
      trusted: false,
      reason: `Invalid base URL "${candidate}" blocked.`,
    };
  }
}

export async function openUrlInBrowser(rawUrl: string, allowedHost?: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (allowedHost && parsed.hostname !== allowedHost) return false;

  const cmd =
    process.platform === "darwin"
      ? { bin: "open", args: [parsed.href] }
      : process.platform === "linux"
        ? { bin: "xdg-open", args: [parsed.href] }
        : { bin: "rundll32", args: ["url.dll,FileProtocolHandler", parsed.href] };

  return await new Promise<boolean>((resolveDone) => {
    const child = spawn(cmd.bin, cmd.args, { stdio: "ignore", shell: false });
    child.on("error", () => resolveDone(false));
    child.on("exit", (code) => resolveDone(code === 0));
  });
}

export function ensurePathInsideDir(filePath: string, allowedDir: string): string | null {
  const resolvedFile = resolve(filePath);
  const resolvedDir = resolve(allowedDir);
  const rel = relative(resolvedDir, resolvedFile);
  if (rel === "" || (!rel.startsWith("..") && rel !== ".")) return resolvedFile;
  return null;
}

export async function fetchWithSafeRedirects(
  inputUrl: string,
  init?: RequestInit,
  maxRedirects = 5,
): Promise<Response> {
  let current = parseSafeExternalUrl(inputUrl);
  if (!current) throw new Error("Blocked unsafe or invalid URL.");

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current.href, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      const next = parseSafeExternalUrl(new URL(location, current).href);
      if (!next) throw new Error("Blocked unsafe redirect target.");
      current = next;
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects.");
}
