export interface RemoteUrlPolicy {
  allowHttp?: boolean;
  allowLocalhost?: boolean;
  allowPrivateNetwork?: boolean;
}

export interface RemoteUrlValidationResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export interface RemoteFetchOptions {
  maxRedirects?: number;
  policy?: RemoteUrlPolicy;
}

const DEFAULT_POLICY: Required<RemoteUrlPolicy> = {
  allowHttp: true,
  allowLocalhost: false,
  allowPrivateNetwork: false,
};

function normalizePolicy(policy?: RemoteUrlPolicy): Required<RemoteUrlPolicy> {
  return {
    allowHttp: policy?.allowHttp ?? DEFAULT_POLICY.allowHttp,
    allowLocalhost: policy?.allowLocalhost ?? DEFAULT_POLICY.allowLocalhost,
    allowPrivateNetwork: policy?.allowPrivateNetwork ?? DEFAULT_POLICY.allowPrivateNetwork,
  };
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function parseIpv4(hostname: string): number | null {
  if (/^\d+$/.test(hostname)) {
    const value = Number(hostname);
    if (Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF) {
      return value >>> 0;
    }
    return null;
  }

  const parts = hostname.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function ipv4InRange(value: number, base: number, prefix: number): boolean {
  const shift = 32 - prefix;
  const mask = shift === 32 ? 0 : (0xFFFFFFFF << shift) >>> 0;
  return (value & mask) === (base & mask);
}

function isBlockedIpv4(value: number): boolean {
  return (
    ipv4InRange(value, 0x00000000, 8) ||
    ipv4InRange(value, 0x0A000000, 8) ||
    ipv4InRange(value, 0x64400000, 10) ||
    ipv4InRange(value, 0x7F000000, 8) ||
    ipv4InRange(value, 0xA9FE0000, 16) ||
    ipv4InRange(value, 0xAC100000, 12) ||
    ipv4InRange(value, 0xC0000000, 24) ||
    ipv4InRange(value, 0xC0000200, 24) ||
    ipv4InRange(value, 0xC0A80000, 16) ||
    ipv4InRange(value, 0xC6120000, 15) ||
    ipv4InRange(value, 0xC6336400, 24) ||
    ipv4InRange(value, 0xCB007100, 24) ||
    ipv4InRange(value, 0xE0000000, 4)
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = normalizeHostname(hostname).replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) return false;

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }
  if (normalized.startsWith("fe80:")) return true;
  if (/^f[cd][0-9a-f:]*$/i.test(normalized)) return true;
  if (normalized.startsWith("2001:db8:")) return true;

  if (normalized.startsWith("::ffff:")) {
    const embeddedIpv4 = parseIpv4(normalized.slice(7));
    return embeddedIpv4 !== null ? isBlockedIpv4(embeddedIpv4) : true;
  }

  return false;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".localdomain") ||
    normalized === "host.docker.internal" ||
    normalized === "metadata" ||
    normalized === "metadata.google.internal"
  );
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export function validateRemoteUrl(input: string | URL, policy?: RemoteUrlPolicy): RemoteUrlValidationResult {
  const effectivePolicy = normalizePolicy(policy);

  let parsed: URL;
  try {
    parsed = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch {
    return { ok: false, reason: "URL is invalid" };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    return { ok: false, reason: `Blocked URL scheme: ${protocol}` };
  }
  if (protocol === "http:" && !effectivePolicy.allowHttp) {
    return { ok: false, reason: "Plain HTTP is not allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Credentialed URLs are not allowed" };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return { ok: false, reason: "URL host is missing" };
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 !== null) {
    if (!effectivePolicy.allowPrivateNetwork && isBlockedIpv4(ipv4)) {
      return { ok: false, reason: `Blocked private or reserved IP: ${hostname}` };
    }
    return { ok: true, url: parsed };
  }

  if (isBlockedIpv6(hostname) && !effectivePolicy.allowPrivateNetwork) {
    return { ok: false, reason: `Blocked private or reserved IP: ${hostname}` };
  }

  if (isLocalHostname(hostname) && !effectivePolicy.allowLocalhost) {
    return { ok: false, reason: `Blocked local hostname: ${hostname}` };
  }

  return { ok: true, url: parsed };
}

export function sanitizeRemoteImageUrl(
  input: string | null | undefined,
  policy?: RemoteUrlPolicy,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/avatars/")) return trimmed;

  const validated = validateRemoteUrl(trimmed, policy);
  return validated.ok ? validated.url!.toString() : null;
}

export async function fetchWithRemoteUrlPolicy(
  input: string | URL,
  init: RequestInit = {},
  options?: RemoteFetchOptions,
): Promise<Response> {
  const maxRedirects = options?.maxRedirects ?? 5;
  let current = input instanceof URL ? input.toString() : input;
  let requestInit: RequestInit = { ...init };

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const validated = validateRemoteUrl(current, options?.policy);
    if (!validated.ok) {
      throw new Error(validated.reason ?? "Blocked remote URL");
    }

    const res = await fetch(validated.url!.toString(), {
      ...requestInit,
      redirect: "manual",
    });
    if (!isRedirectStatus(res.status)) {
      return res;
    }

    const location = res.headers.get("location");
    if (!location) return res;
    if (redirects === maxRedirects) {
      throw new Error(`Too many redirects for ${validated.url!.toString()}`);
    }

    current = new URL(location, validated.url).toString();
    if (res.status === 303 && (requestInit.method ?? "GET").toUpperCase() !== "HEAD") {
      const { body: _body, ...rest } = requestInit;
      requestInit = { ...rest, method: "GET" };
    }
  }

  throw new Error("Redirect loop exceeded safety limit");
}
