import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_RAW_ARG_CHARS = 65_536;
export const MAX_SESSION_KEY_CHARS = 512;
export const MAX_IDEMPOTENCY_KEY_CHARS = 256;
export const MAX_TARGET_CHARS = 256;
export const MAX_RUN_ID_CHARS = 64;
export const MAX_LANE_VERSION = 1_000_000;
export const MAX_MESSAGE_CHARS = 24_000;
export const MAX_EXTRA_SYSTEM_PROMPT_CHARS = 24_000;
export const MAX_AUDIT_STRING_CHARS = 400;
export const MAX_CHILD_OUTPUT_CHARS = 280;
export const GATEWAY_CALL_TIMEOUT_MS = 20_000;
export const GATEWAY_CALL_MAX_ATTEMPTS = 3;
export const GATEWAY_CALL_RETRY_DELAY_MS = 1_200;
// How long to wait for the agent to finish the trade run before logging a timeout.
// Long-form sources can take several minutes once routing and posting begin.
export const AGENT_WAIT_TIMEOUT_MS = 900_000;
export const SESSION_LOOKUP_TIMEOUT_MS = 10_000;
export const SESSION_LOOKUP_LIMIT = 80;
export const SESSION_LOOKUP_MAX_BUFFER_BYTES = 1024 * 1024;
export const FINAL_MESSAGE_LOOKUP_LIMIT = 24;
export const DIRECT_SEND_TIMEOUT_MS = 15_000;
export const LIVE_LINK_POLL_INTERVAL_MS = 750;
export const LIVE_LINK_WAIT_TIMEOUT_MS = 90_000;
const KNOWN_MESSAGE_CHANNELS = new Set([
  "telegram",
  "whatsapp",
  "discord",
  "signal",
  "imessage",
  "slack",
  "sms",
  "email",
]);

export const DEFAULT_AUDIT_LOG_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "logs",
  "trade-slash-wrapper.audit.log",
);
export const DEFAULT_TRADE_RUNTIME_AUDIT_LOG_PATH = path.join(
  process.env.PASTE_TRADE_STATE_DIR?.trim() ||
    (process.env.XDG_STATE_HOME?.trim()
      ? path.join(process.env.XDG_STATE_HOME.trim(), "paste-trade")
      : path.join(os.homedir(), ".paste-trade")),
  "logs",
  "trade-runtime.audit.log",
);
const RUNTIME_DATA_DIR_CANDIDATES = [
  fileURLToPath(new URL("../data", import.meta.url)),
  fileURLToPath(new URL("../../data", import.meta.url)),
];

function resolveRuntimeDataDirPath() {
  for (const candidate of RUNTIME_DATA_DIR_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return RUNTIME_DATA_DIR_CANDIDATES[0];
}

export const DEFAULT_STREAM_CONTEXT_DIR_PATH = resolveRuntimeDataDirPath();
export const DEFAULT_LANE_STATE_DIR_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "state",
  "trade-slash-wrapper",
  "lanes",
);
export const LANE_STATE_LOCK_TIMEOUT_MS = 5_000;
export const LANE_STATE_LOCK_RETRY_MS = 25;
export const LANE_STATE_LOCK_STALE_MS = 15_000;
export const STALE_LANE_RUN_TTL_MS = 2 * 60 * 60 * 1000;

export function hashForAudit(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function hashForState(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

function normalizeLaneVersion(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(MAX_LANE_VERSION, Math.max(1, Math.floor(parsed)));
}

export function tradeWorkerLaneStateFilePath(
  sessionKey,
  laneStateDirPath = DEFAULT_LANE_STATE_DIR_PATH,
) {
  return path.join(laneStateDirPath, `${hashForState(sessionKey)}.json`);
}

function tradeWorkerLaneLockPath(sessionKey, laneStateDirPath = DEFAULT_LANE_STATE_DIR_PATH) {
  return path.join(laneStateDirPath, `${hashForState(sessionKey)}.lock`);
}

export function sanitizeAuditString(value) {
  return String(value)
    .replace(/\0/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, MAX_AUDIT_STRING_CHARS);
}

function summarizeChildOutput(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = sanitizeAuditString(value);
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_CHILD_OUTPUT_CHARS);
}

function sleepMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function sleepAsync(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLaneRunTimestampMs(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function loadTradeWorkerLaneState(sessionKey, opts = {}) {
  const laneStateDirPath = opts.laneStateDirPath ?? DEFAULT_LANE_STATE_DIR_PATH;
  const statePath = tradeWorkerLaneStateFilePath(sessionKey, laneStateDirPath);
  const defaultState = {
    sessionKeyHash: hashForAudit(sessionKey),
    laneVersion: 1,
    openRuns: [],
    updatedAt: null,
  };

  if (!existsSync(statePath)) {
    return {
      statePath,
      hadExistingFile: false,
      rawOpenRunCount: 0,
      staleRunCount: 0,
      state: defaultState,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {
      statePath,
      hadExistingFile: true,
      rawOpenRunCount: 0,
      staleRunCount: 0,
      state: defaultState,
    };
  }

  const rawOpenRuns = Array.isArray(parsed?.openRuns) ? parsed.openRuns : [];
  const nowMs = Date.now();
  const staleRunTtlMs =
    Number.isFinite(opts.staleLaneRunTtlMs) && opts.staleLaneRunTtlMs > 0
      ? Math.floor(opts.staleLaneRunTtlMs)
      : STALE_LANE_RUN_TTL_MS;
  const openRuns = [];

  for (const rawRun of rawOpenRuns) {
    const runId = typeof rawRun?.runId === "string" ? rawRun.runId.trim() : "";
    if (!runId) {
      continue;
    }
    const registeredAt =
      typeof rawRun?.registeredAt === "string" && rawRun.registeredAt.trim()
        ? rawRun.registeredAt.trim()
        : null;
    const registeredAtMs = parseLaneRunTimestampMs(registeredAt);
    if (!registeredAtMs || nowMs - registeredAtMs > staleRunTtlMs) {
      continue;
    }
    openRuns.push({ runId, registeredAt });
  }

  return {
    statePath,
    hadExistingFile: true,
    rawOpenRunCount: rawOpenRuns.length,
    staleRunCount: Math.max(0, rawOpenRuns.length - openRuns.length),
    state: {
      sessionKeyHash:
        typeof parsed?.sessionKeyHash === "string" && parsed.sessionKeyHash.trim()
          ? parsed.sessionKeyHash.trim()
          : hashForAudit(sessionKey),
      laneVersion: normalizeLaneVersion(parsed?.laneVersion),
      openRuns,
      updatedAt:
        typeof parsed?.updatedAt === "string" && parsed.updatedAt.trim()
          ? parsed.updatedAt.trim()
          : null,
    },
  };
}

function persistTradeWorkerLaneState(sessionKey, state, opts = {}) {
  const laneStateDirPath = opts.laneStateDirPath ?? DEFAULT_LANE_STATE_DIR_PATH;
  const statePath = tradeWorkerLaneStateFilePath(sessionKey, laneStateDirPath);
  const normalizedOpenRuns = Array.isArray(state?.openRuns)
    ? state.openRuns
        .map((entry) => ({
          runId: typeof entry?.runId === "string" ? entry.runId.trim() : "",
          registeredAt:
            typeof entry?.registeredAt === "string" && entry.registeredAt.trim()
              ? entry.registeredAt.trim()
              : new Date().toISOString(),
        }))
        .filter((entry) => entry.runId)
    : [];

  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        sessionKeyHash: hashForAudit(sessionKey),
        laneVersion: normalizeLaneVersion(state?.laneVersion),
        openRuns: normalizedOpenRuns,
        updatedAt:
          typeof state?.updatedAt === "string" && state.updatedAt.trim()
            ? state.updatedAt.trim()
            : new Date().toISOString(),
      },
      null,
      2,
    ),
    { encoding: "utf8", mode: 0o600 },
  );
}

function withTradeWorkerLaneLock(sessionKey, opts, fn) {
  const laneStateDirPath = opts?.laneStateDirPath ?? DEFAULT_LANE_STATE_DIR_PATH;
  const lockPath = tradeWorkerLaneLockPath(sessionKey, laneStateDirPath);
  const timeoutMs =
    Number.isFinite(opts?.laneLockTimeoutMs) && opts.laneLockTimeoutMs > 0
      ? Math.floor(opts.laneLockTimeoutMs)
      : LANE_STATE_LOCK_TIMEOUT_MS;
  const retryMs =
    Number.isFinite(opts?.laneLockRetryMs) && opts.laneLockRetryMs > 0
      ? Math.floor(opts.laneLockRetryMs)
      : LANE_STATE_LOCK_RETRY_MS;
  const staleMs =
    Number.isFinite(opts?.laneLockStaleMs) && opts.laneLockStaleMs > 0
      ? Math.floor(opts.laneLockStaleMs)
      : LANE_STATE_LOCK_STALE_MS;
  const deadlineMs = Date.now() + timeoutMs;

  mkdirSync(laneStateDirPath, { recursive: true });

  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw error;
      }

      try {
        const stats = statSync(lockPath);
        if (Number.isFinite(stats.mtimeMs) && Date.now() - stats.mtimeMs > staleMs) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Best effort stale-lock cleanup only.
      }

      if (Date.now() >= deadlineMs) {
        throw new Error("trade worker lane lock timeout");
      }
      sleepMs(retryMs);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function registerTradeWorkerRun(sessionKey, runId, opts = {}) {
  const normalizedSessionKey = typeof sessionKey === "string" ? sessionKey.trim() : "";
  const normalizedRunId = typeof runId === "string" ? runId.trim() : "";
  if (!normalizedSessionKey) {
    throw new Error("sessionKey is required");
  }
  if (!normalizedRunId) {
    throw new Error("runId is required");
  }

  return withTradeWorkerLaneLock(normalizedSessionKey, opts, () => {
    const loaded = loadTradeWorkerLaneState(normalizedSessionKey, opts);
    const state = loaded.state;
    if (loaded.rawOpenRunCount > 0 && state.openRuns.length === 0) {
      state.laneVersion = normalizeLaneVersion(state.laneVersion + 1);
    }

    const existingIndex = state.openRuns.findIndex((entry) => entry.runId === normalizedRunId);
    const aheadCount = existingIndex >= 0 ? existingIndex : state.openRuns.length;
    if (existingIndex === -1) {
      state.openRuns.push({
        runId: normalizedRunId,
        registeredAt: new Date().toISOString(),
      });
    }
    state.updatedAt = new Date().toISOString();
    persistTradeWorkerLaneState(normalizedSessionKey, state, opts);
    return {
      laneVersion: state.laneVersion,
      aheadCount,
      queued: aheadCount > 0,
      openRunCount: state.openRuns.length,
      staleRunCount: loaded.staleRunCount,
    };
  });
}

export function completeTradeWorkerRun(sessionKey, runId, opts = {}) {
  const normalizedSessionKey = typeof sessionKey === "string" ? sessionKey.trim() : "";
  const normalizedRunId = typeof runId === "string" ? runId.trim() : "";
  if (!normalizedSessionKey || !normalizedRunId) {
    return {
      removed: false,
      rotated: false,
      remainingCount: 0,
      laneVersion: 1,
      staleRunCount: 0,
    };
  }

  const statePath = tradeWorkerLaneStateFilePath(normalizedSessionKey, opts.laneStateDirPath);
  if (!existsSync(statePath)) {
    return {
      removed: false,
      rotated: false,
      remainingCount: 0,
      laneVersion: 1,
      staleRunCount: 0,
    };
  }

  return withTradeWorkerLaneLock(normalizedSessionKey, opts, () => {
    const loaded = loadTradeWorkerLaneState(normalizedSessionKey, opts);
    const state = loaded.state;
    const openRunCountBefore = state.openRuns.length;
    state.openRuns = state.openRuns.filter((entry) => entry.runId !== normalizedRunId);
    const removed = state.openRuns.length !== openRunCountBefore;
    const hadAnyOpenRuns = openRunCountBefore > 0 || loaded.rawOpenRunCount > 0;
    let rotated = false;
    if (hadAnyOpenRuns && state.openRuns.length === 0) {
      state.laneVersion = normalizeLaneVersion(state.laneVersion + 1);
      rotated = true;
    }
    state.updatedAt = new Date().toISOString();
    persistTradeWorkerLaneState(normalizedSessionKey, state, opts);
    return {
      removed,
      rotated,
      remainingCount: state.openRuns.length,
      laneVersion: state.laneVersion,
      staleRunCount: loaded.staleRunCount,
    };
  });
}

function runExecFile(cmd, args, options, execFileImpl = execFile) {
  return new Promise((resolve) => {
    execFileImpl(cmd, args, options, (error, stdout, stderr) => {
      resolve({
        status:
          error && typeof error.code === "number"
            ? error.code
            : error
              ? 1
              : 0,
        error: error ?? null,
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
      });
    });
  });
}

function shouldRetryGatewayCall(result) {
  if (!result || result.status === 0) {
    return false;
  }
  const combined = [
    result.error ? String(result.error.message || result.error) : "",
    typeof result.stderr === "string" ? result.stderr : "",
    typeof result.stdout === "string" ? result.stdout : "",
  ]
    .join("\n")
    .toLowerCase();

  return (
    combined.includes("gateway timeout") ||
    combined.includes("closed before connect") ||
    combined.includes("econnrefused") ||
    combined.includes("connection refused") ||
    combined.includes("econnreset")
  );
}

function assertNoNullBytes(value, fieldName) {
  if (value.includes("\0")) {
    throw new Error(`${fieldName} contains null bytes`);
  }
}

function assertBoundedString(value, fieldName, maxChars) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  if (!value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  if (value.length > maxChars) {
    throw new Error(`${fieldName} is too long (${value.length}). Max ${maxChars}.`);
  }
  assertNoNullBytes(value, fieldName);
  return value.trim();
}

export function parseWrapperPayload(rawArg) {
  if (typeof rawArg !== "string" || !rawArg) {
    throw new Error("missing payload");
  }
  if (rawArg.length > MAX_RAW_ARG_CHARS) {
    throw new Error(`payload arg too large (${rawArg.length}). Max ${MAX_RAW_ARG_CHARS}.`);
  }
  assertNoNullBytes(rawArg, "payload");

  let parsed;
  try {
    parsed = JSON.parse(rawArg);
  } catch {
    throw new Error("payload is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be a JSON object");
  }

  const sessionKey = assertBoundedString(parsed.sessionKey, "sessionKey", MAX_SESSION_KEY_CHARS);
  const idempotencyKey = assertBoundedString(
    parsed.idempotencyKey,
    "idempotencyKey",
    MAX_IDEMPOTENCY_KEY_CHARS,
  );
  const target =
    parsed.target === undefined || parsed.target === null
      ? null
      : assertBoundedString(parsed.target, "target", MAX_TARGET_CHARS);
  const runId =
    parsed.runId === undefined || parsed.runId === null
      ? null
      : assertBoundedString(parsed.runId, "runId", MAX_RUN_ID_CHARS);
  const laneVersion =
    parsed.laneVersion === undefined || parsed.laneVersion === null
      ? null
      : normalizeLaneVersion(parsed.laneVersion);
  const message = assertBoundedString(parsed.message, "message", MAX_MESSAGE_CHARS);
  const extraSystemPrompt =
    parsed.extraSystemPrompt === undefined || parsed.extraSystemPrompt === null
      ? null
      : assertBoundedString(
          parsed.extraSystemPrompt,
          "extraSystemPrompt",
          MAX_EXTRA_SYSTEM_PROMPT_CHARS,
        );

  const topicId =
    parsed.topicId === undefined || parsed.topicId === null
      ? null
      : String(parsed.topicId).trim() || null;

  return { sessionKey, idempotencyKey, target, topicId, runId, laneVersion, message, extraSystemPrompt };
}

export function deriveMessageChannelFromSessionKey(sessionKey) {
  const normalized = typeof sessionKey === "string" ? sessionKey.trim().toLowerCase() : "";
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("agent:")) {
    const parts = normalized.split(":");
    const channel = parts[2] ?? "";
    return KNOWN_MESSAGE_CHANNELS.has(channel) ? channel : null;
  }

  const first = normalized.split(":")[0] ?? "";
  return KNOWN_MESSAGE_CHANNELS.has(first) ? first : null;
}

const TOPIC_SUFFIX_PATTERN = /:topic:(\d+)$/i;

/**
 * Extract the Telegram topic ID from a session key, if present.
 */
export function deriveTelegramTopicFromSessionKey(sessionKey) {
  const normalized = typeof sessionKey === "string" ? sessionKey.trim() : "";
  const topicMatch = normalized.match(TOPIC_SUFFIX_PATTERN);
  return topicMatch ? topicMatch[1] : null;
}

/**
 * Extract the base Telegram chat ID (strips :topic:N suffix).
 * Handles group, direct, and slash session key formats.
 */
export function deriveTelegramTargetFromSessionKey(sessionKey) {
  const normalized = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!normalized) {
    return null;
  }

  // Strip :topic:N suffix to get the base chat ID
  const withoutTopic = normalized.replace(TOPIC_SUFFIX_PATTERN, "").trim();

  const directMatch = withoutTopic.match(/^agent:[^:]+:telegram:direct:(.+)$/i);
  if (directMatch && directMatch[1].trim()) {
    return directMatch[1].trim();
  }

  const groupMatch = withoutTopic.match(/^agent:[^:]+:telegram:group:(.+)$/i);
  if (groupMatch && groupMatch[1].trim()) {
    return groupMatch[1].trim();
  }

  const slashMatch = withoutTopic.match(/^agent:[^:]+:telegram:slash:(.+)$/i);
  if (slashMatch && slashMatch[1].trim()) {
    return slashMatch[1].trim();
  }

  const rawDirect = withoutTopic.match(/^telegram:direct:(.+)$/i);
  if (rawDirect && rawDirect[1].trim()) {
    return rawDirect[1].trim();
  }

  const rawGroup = withoutTopic.match(/^telegram:group:(.+)$/i);
  if (rawGroup && rawGroup[1].trim()) {
    return rawGroup[1].trim();
  }

  const rawSlash = withoutTopic.match(/^telegram:slash:(.+)$/i);
  if (rawSlash && rawSlash[1].trim()) {
    return rawSlash[1].trim();
  }

  return null;
}

export function deriveAgentSessionNamespace(sessionKey) {
  const normalized = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!normalized) {
    return {
      agentId: "main",
      sessionChannel: "main",
    };
  }

  if (normalized.startsWith("agent:")) {
    const parts = normalized.split(":");
    const agentId = parts[1]?.trim() || "main";
    const sessionChannel = parts[2]?.trim() || "main";
    return { agentId, sessionChannel };
  }

  return {
    agentId: "main",
    sessionChannel: deriveMessageChannelFromSessionKey(normalized) || "main",
  };
}

export function buildTradeSessionKey(sessionKey, laneVersion) {
  const { agentId, sessionChannel } = deriveAgentSessionNamespace(sessionKey);
  return `agent:${agentId}:${sessionChannel}:trade-worker:${normalizeLaneVersion(laneVersion)}`;
}

export function buildAgentCallParams(payload) {
  // Reuse one hidden worker lane per chat so OpenClaw can serialize /trade runs
  // natively for that chat while still keeping the worker isolated from the
  // user's visible conversation.
  const laneVersion = normalizeLaneVersion(payload.laneVersion);
  const tradeSessionKey = buildTradeSessionKey(payload.sessionKey, laneVersion);

  const params = {
    sessionKey: tradeSessionKey,
    message: payload.message,
    idempotencyKey: payload.idempotencyKey,
    // The wrapper owns all user-visible delivery. The worker runs silently in an
    // isolated session so intermediate progress chatter cannot leak into chat.
    deliver: false,
    ...(payload.extraSystemPrompt ? { extraSystemPrompt: payload.extraSystemPrompt } : {}),
  };

  return JSON.stringify(params);
}

export function buildChatSendParams(payload) {
  return buildAgentCallParams(payload);
}

export function appendAuditEvent(event, opts = {}) {
  const auditLogPath = opts.auditLogPath ?? DEFAULT_AUDIT_LOG_PATH;
  const line = JSON.stringify(
    {
      ts: new Date().toISOString(),
      event,
    },
    (_key, value) => (typeof value === "string" ? sanitizeAuditString(value) : value),
  );

  mkdirSync(path.dirname(auditLogPath), { recursive: true });
  appendFileSync(auditLogPath, `${line}\n`, { encoding: "utf8", mode: 0o600 });
}

function summarizePayloadForAudit(payload) {
  return {
    sessionKeyHash: hashForAudit(payload.sessionKey),
    targetHash: payload.target ? hashForAudit(payload.target) : null,
    idempotencyKeyHash: hashForAudit(payload.idempotencyKey),
    runIdHash: payload.runId ? hashForAudit(payload.runId) : null,
    laneVersion: normalizeLaneVersion(payload.laneVersion),
    messageHash: hashForAudit(payload.message),
    messageLength: payload.message.length,
    extraSystemPromptHash: payload.extraSystemPrompt ? hashForAudit(payload.extraSystemPrompt) : null,
    extraSystemPromptLength: payload.extraSystemPrompt?.length ?? 0,
  };
}

function readTradeRuntimeEventsForRun(runId, opts = {}) {
  if (typeof runId !== "string" || !runId.trim()) {
    return [];
  }

  const traceLogPath = opts.traceLogPath ?? DEFAULT_TRADE_RUNTIME_AUDIT_LOG_PATH;
  if (!existsSync(traceLogPath)) {
    return [];
  }

  const runIdHash = hashForAudit(runId);
  try {
    const lines = readFileSync(traceLogPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.event && entry.event.runIdHash === runIdHash)
      .map((entry) => entry.event);
  } catch {
    return [];
  }
}

function summarizeRuntimeEvents(events) {
  const eventTypes = Array.from(
    new Set(
      (Array.isArray(events) ? events : [])
        .map((entry) => (entry && typeof entry.type === "string" ? entry.type : ""))
        .filter(Boolean),
    ),
  );

  return {
    eventTypes,
    createdSource: eventTypes.includes("trade_run_created_source"),
    finalized: eventTypes.includes("trade_run_finalize_emitted"),
  };
}

function fetchSessionMessages(sessionKey, spawnSyncImpl, opts = {}) {
  if (typeof sessionKey !== "string" || !sessionKey.trim()) {
    return { ok: false, reason: "missing_session_key", messages: [] };
  }

  const limit =
    Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : SESSION_LOOKUP_LIMIT;
  const maxBufferBytes =
    Number.isFinite(opts.maxBufferBytes) && opts.maxBufferBytes > 0
      ? Math.floor(opts.maxBufferBytes)
      : SESSION_LOOKUP_MAX_BUFFER_BYTES;

  const result = spawnSyncImpl(
    "openclaw",
    [
      "gateway",
      "call",
      "sessions.get",
      "--json",
      "--timeout",
      String(SESSION_LOOKUP_TIMEOUT_MS),
      "--params",
      JSON.stringify({
        key: sessionKey,
        limit,
      }),
    ],
    {
      stdio: "pipe",
      encoding: "utf8",
      maxBuffer: maxBufferBytes,
      timeout: SESSION_LOOKUP_TIMEOUT_MS + 5_000,
      shell: false,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      reason: result.error ? String(result.error.message || result.error) : "sessions_get_failed",
      stderr: summarizeChildOutput(result.stderr),
      messages: [],
    };
  }

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return {
      ok: true,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return {
      ok: false,
      reason: "sessions_get_parse_failed",
      messages: [],
    };
  }
}

function sessionHasToolActivity(messages) {
  let toolResultCount = 0;
  let assistantToolCallCount = 0;

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== "object") {
      continue;
    }

    if (message.role === "toolResult" || message.role === "tool") {
      toolResultCount += 1;
      continue;
    }

    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      if (
        block.type === "toolCall" ||
        block.type === "toolUse" ||
        block.type === "functionCall"
      ) {
        assistantToolCallCount += 1;
      }
    }
  }

  return {
    confirmed: toolResultCount > 0 || assistantToolCallCount > 0,
    toolResultCount,
    assistantToolCallCount,
  };
}

function extractAssistantText(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block) => block && typeof block === "object" && block.type === "text")
    .map((block) => (typeof block.text === "string" ? block.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n")
    .replace(/\[\[reply_to_current\]\]\s*/g, "")
    .trim();
}

function hasAssistantToolCall(content) {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some(
    (block) =>
      block &&
      typeof block === "object" &&
      (block.type === "toolCall" || block.type === "toolUse" || block.type === "functionCall"),
  );
}

function readFinalAssistantMessage(sessionKey, spawnSyncImpl, opts = {}) {
  const sessionLookup = fetchSessionMessages(sessionKey, spawnSyncImpl, {
    limit:
      Number.isFinite(opts.finalMessageSessionLookupLimit) && opts.finalMessageSessionLookupLimit > 0
        ? Math.floor(opts.finalMessageSessionLookupLimit)
        : FINAL_MESSAGE_LOOKUP_LIMIT,
    maxBufferBytes:
      Number.isFinite(opts.finalMessageSessionLookupMaxBufferBytes) &&
      opts.finalMessageSessionLookupMaxBufferBytes > 0
        ? Math.floor(opts.finalMessageSessionLookupMaxBufferBytes)
        : SESSION_LOOKUP_MAX_BUFFER_BYTES,
  });
  if (!sessionLookup.ok) {
    return {
      ok: false,
      reason: sessionLookup.reason ?? "sessions_get_failed",
      stderr: sessionLookup.stderr ?? null,
      message: "",
    };
  }

  const messages = Array.isArray(sessionLookup.messages) ? sessionLookup.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    if (hasAssistantToolCall(message.content)) {
      continue;
    }
    const text = extractAssistantText(message.content);
    if (!text) {
      continue;
    }
    return {
      ok: true,
      reason: null,
      stderr: null,
      message: text,
    };
  }

  return {
    ok: true,
    reason: null,
    stderr: null,
    message: "",
  };
}

function verifyTradeExecution(payload, tradeSessionKey, spawnSyncImpl, opts = {}) {
  const runtimeEvents = payload.runId ? readTradeRuntimeEventsForRun(payload.runId, opts) : [];
  const runtimeSummary = summarizeRuntimeEvents(runtimeEvents);
  if (runtimeSummary.eventTypes.length > 0) {
    return {
      confirmed: true,
      source: "runtime_trace",
      runtimeEventTypes: runtimeSummary.eventTypes,
      createdSource: runtimeSummary.createdSource,
      finalized: runtimeSummary.finalized,
      toolResultCount: 0,
      assistantToolCallCount: 0,
      sessionLookupOk: true,
    };
  }

  const sessionLookup = fetchSessionMessages(tradeSessionKey, spawnSyncImpl);
  const sessionSummary = sessionHasToolActivity(sessionLookup.messages);
  return {
    confirmed: sessionSummary.confirmed,
    source: sessionSummary.confirmed ? "session_tool_activity" : null,
    runtimeEventTypes: [],
    createdSource: false,
    finalized: false,
    toolResultCount: sessionSummary.toolResultCount,
    assistantToolCallCount: sessionSummary.assistantToolCallCount,
    sessionLookupOk: sessionLookup.ok,
    sessionLookupReason: sessionLookup.reason ?? null,
    sessionLookupStderr: sessionLookup.stderr ?? null,
  };
}

function buildNotifyParams(payload, message, channel, target) {
  return JSON.stringify({
    sessionKey: payload.sessionKey,
    message,
    idempotencyKey: `${payload.idempotencyKey}-${hashForAudit(message)}`,
    deliver: true,
    ...(channel ? { channel } : {}),
    ...(target ? { to: target } : {}),
  });
}

function streamContextFilePath(runId, streamContextDirPath = DEFAULT_STREAM_CONTEXT_DIR_PATH) {
  return path.join(streamContextDirPath, `.stream-context-${runId}.json`);
}

function readStreamContextForRun(runId, opts = {}) {
  if (typeof runId !== "string" || !runId.trim()) {
    return null;
  }

  const contextPath = streamContextFilePath(runId.trim(), opts.streamContextDirPath);
  if (!existsSync(contextPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(contextPath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const sourceId = typeof parsed.source_id === "string" ? parsed.source_id.trim() : "";
    const sourceUrl = typeof parsed.source_url === "string" ? parsed.source_url.trim() : "";
    const contextRunId = typeof parsed.run_id === "string" ? parsed.run_id.trim() : runId.trim();
    if (!sourceId || !sourceUrl) {
      return null;
    }
    return {
      sourceId,
      sourceUrl,
      runId: contextRunId,
      contextPath,
    };
  } catch {
    return null;
  }
}

async function waitForLiveLinkContext(runId, opts = {}) {
  const pollIntervalMs = Number.isFinite(opts.pollIntervalMs) && opts.pollIntervalMs > 0
    ? opts.pollIntervalMs
    : LIVE_LINK_POLL_INTERVAL_MS;
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs >= 0
    ? opts.timeoutMs
    : AGENT_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (typeof opts.shouldStop === "function" && opts.shouldStop()) {
      return null;
    }
    const ctx = readStreamContextForRun(runId, opts);
    if (ctx) {
      return ctx;
    }
    await sleepAsync(pollIntervalMs);
  }
  return null;
}

export function buildDirectSendArgs(channel, target, message, topicId) {
  const args = [
    "message",
    "send",
    "--json",
    "--channel",
    channel,
    "--target",
    target,
    "--message",
    message,
  ];
  if (topicId) {
    args.push("--thread-id", String(topicId));
  }
  return args;
}

function sendDirectMessage(channel, target, message, spawnSyncImpl, topicId) {
  if (
    typeof channel !== "string" ||
    !channel.trim() ||
    typeof target !== "string" ||
    !target.trim() ||
    typeof message !== "string" ||
    !message.trim()
  ) {
    return {
      ok: false,
      reason: "missing_delivery_target",
      status: null,
      stdout: null,
      stderr: null,
    };
  }

  const result = spawnSyncImpl(
    "openclaw",
    buildDirectSendArgs(channel.trim(), target.trim(), message.trim(), topicId || null),
    {
      stdio: "pipe",
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      timeout: DIRECT_SEND_TIMEOUT_MS,
      shell: false,
      windowsHide: true,
    },
  );

  return {
    ok: !result.error && result.status === 0,
    reason: result.error ? String(result.error.message || result.error) : null,
    status: result.status ?? null,
    stdout: summarizeChildOutput(result.stdout),
    stderr: summarizeChildOutput(result.stderr),
  };
}

function sendWrapperNotice(payload, message, channel, target, spawnSyncImpl, topicId) {
  if (channel && target) {
    return {
      mode: "direct_send",
      ...sendDirectMessage(channel, target, message, spawnSyncImpl, topicId),
    };
  }

  const notifyParams = buildNotifyParams(payload, message, channel, target);
  const result = spawnSyncImpl(
    "openclaw",
    ["gateway", "call", "agent", "--json", "--timeout", "10000", "--params", notifyParams],
    {
      stdio: "ignore",
      timeout: 15_000,
      shell: false,
      windowsHide: true,
    },
  );
  return {
    mode: "agent_notify_fallback",
    ok: !result.error && result.status === 0,
    reason: result.error ? String(result.error.message || result.error) : null,
    status: result.status ?? null,
    stdout: null,
    stderr: null,
  };
}

export async function runWrapper(rawArg, opts = {}) {
  const spawnSyncImpl = opts.spawnSyncImpl ?? spawnSync;
  const runAsyncCommandImpl =
    opts.runAsyncCommandImpl ??
    ((cmd, args, options) => {
      if (opts.spawnSyncImpl) {
        return Promise.resolve(spawnSyncImpl(cmd, args, options));
      }
      return runExecFile(cmd, args, options, opts.execFileImpl ?? execFile);
    });
  const auditLogPath = opts.auditLogPath;

  let payload;
  try {
    payload = parseWrapperPayload(rawArg);
  } catch (error) {
    appendAuditEvent(
      {
        type: "trade_wrapper_invalid_payload",
        reason: error instanceof Error ? error.message : String(error),
      },
      { auditLogPath },
    );
    return 2;
  }

  const auditBase = summarizePayloadForAudit(payload);
  const channel = deriveMessageChannelFromSessionKey(payload.sessionKey);
  const target =
    typeof payload.target === "string" && payload.target.trim()
      ? payload.target.trim()
      : deriveTelegramTargetFromSessionKey(payload.sessionKey);
  const topicId =
    (typeof payload.topicId === "string" && payload.topicId.trim())
      ? payload.topicId.trim()
      : deriveTelegramTopicFromSessionKey(payload.sessionKey);
  const deliveryMeta = {
    channel: channel ?? null,
    targetHash: target ? hashForAudit(target) : auditBase.targetHash,
    targetPresent: Boolean(target),
    topicId: topicId ?? null,
    handoffMessageLength: payload.message.length,
    handoffExtraSystemPromptLength: payload.extraSystemPrompt?.length ?? 0,
  };
  const tradeSessionKey = buildTradeSessionKey(payload.sessionKey, payload.laneVersion);
  let params;
  try {
    params = buildAgentCallParams(payload);
  } catch (error) {
    appendAuditEvent(
      {
        type: "trade_wrapper_handoff_preflight_failed",
        ...auditBase,
        ...deliveryMeta,
        reason: error instanceof Error ? error.message : String(error),
      },
      { auditLogPath },
    );
    return 1;
  }

  try {
    let result = null;
    for (let attempt = 1; attempt <= GATEWAY_CALL_MAX_ATTEMPTS; attempt++) {
      result = spawnSyncImpl(
        "openclaw",
        [
          "gateway",
          "call",
          "agent",
          "--json",
          "--timeout",
          String(GATEWAY_CALL_TIMEOUT_MS),
          "--params",
          params,
        ],
        {
          stdio: "pipe",
          encoding: "utf8",
          maxBuffer: 64 * 1024,
          timeout: GATEWAY_CALL_TIMEOUT_MS + 5_000,
          shell: false,
          windowsHide: true,
        },
      );
      if (!result.error && result.status === 0) {
        break;
      }
      if (attempt >= GATEWAY_CALL_MAX_ATTEMPTS || !shouldRetryGatewayCall(result)) {
        break;
      }
      appendAuditEvent(
        {
          type: "trade_wrapper_handoff_retry",
          ...auditBase,
          ...deliveryMeta,
          attempt,
          status: result.status ?? null,
          error: result.error ? String(result.error.message || result.error) : null,
          stderr: summarizeChildOutput(result.stderr),
          stdout: summarizeChildOutput(result.stdout),
        },
        { auditLogPath },
      );
      sleepMs(GATEWAY_CALL_RETRY_DELAY_MS * attempt);
    }

    if (!result || result.error || result.status !== 0) {
      appendAuditEvent(
        {
          type: "trade_wrapper_handoff_failed",
          ...auditBase,
          ...deliveryMeta,
          status: result.status ?? null,
          error: result.error ? String(result.error.message || result.error) : null,
          stderr: summarizeChildOutput(result.stderr),
          stdout: summarizeChildOutput(result.stdout),
        },
        { auditLogPath },
      );
      return 1;
    }

    appendAuditEvent(
      {
        type: "trade_wrapper_handoff_started",
        ...auditBase,
        ...deliveryMeta,
        status: result.status ?? 0,
      },
      { auditLogPath },
    );

    // Watchdog: wait for the agent run to finish and log the outcome.
    // The gateway `agent` RPC returns { runId, acceptedAt } on success.
    let gatewayRunId = null;
    try {
      const parsed = JSON.parse(result.stdout || "{}");
      gatewayRunId = typeof parsed.runId === "string" ? parsed.runId : null;
    } catch {
      // Non-JSON response — skip watchdog
    }

    if (gatewayRunId) {
      const waitParams = JSON.stringify({
        runId: gatewayRunId,
        timeoutMs: AGENT_WAIT_TIMEOUT_MS,
      });
      let waitCompleted = false;
      const waitResultPromise = runAsyncCommandImpl(
        "openclaw",
        [
          "gateway",
          "call",
          "agent.wait",
          "--json",
          "--timeout",
          String(AGENT_WAIT_TIMEOUT_MS + 5_000),
          "--params",
          waitParams,
        ],
        {
          stdio: "pipe",
          encoding: "utf8",
          maxBuffer: 64 * 1024,
          timeout: AGENT_WAIT_TIMEOUT_MS + 15_000,
          shell: false,
          windowsHide: true,
        },
      );

      const liveLinkPromise =
        payload.runId && channel && target
          ? (async () => {
              const ctx = await waitForLiveLinkContext(payload.runId, {
                streamContextDirPath: opts.streamContextDirPath,
                pollIntervalMs: opts.liveLinkPollIntervalMs,
                timeoutMs:
                  Number.isFinite(opts.liveLinkWaitTimeoutMs) && opts.liveLinkWaitTimeoutMs > 0
                    ? Math.floor(opts.liveLinkWaitTimeoutMs)
                    : AGENT_WAIT_TIMEOUT_MS,
                shouldStop: () => waitCompleted,
              });
              if (!ctx) {
                return { attempted: false, sent: false, reason: "context_not_found" };
              }

              const delivery = sendDirectMessage(
                channel,
                target,
                `Watch live: ${ctx.sourceUrl}`,
                spawnSyncImpl,
                topicId,
              );
              appendAuditEvent(
                {
                  type:
                    delivery.ok ? "trade_wrapper_live_link_sent" : "trade_wrapper_live_link_failed",
                  ...auditBase,
                  channel,
                  targetHash: hashForAudit(target),
                  runIdHash: hashForAudit(payload.runId),
                  sourceIdHash: hashForAudit(ctx.sourceId),
                  sourceUrlHash: hashForAudit(ctx.sourceUrl),
                  deliveryMode: "direct_send",
                  deliveryStatus: delivery.status,
                  deliveryReason: delivery.reason,
                  deliveryStdout: delivery.stdout,
                  deliveryStderr: delivery.stderr,
                },
                { auditLogPath },
              );
              return {
                attempted: true,
                sent: delivery.ok,
                reason: delivery.reason,
                sourceIdHash: hashForAudit(ctx.sourceId),
                sourceUrlHash: hashForAudit(ctx.sourceUrl),
              };
            })()
          : Promise.resolve({
              attempted: false,
              sent: false,
              reason: payload.runId ? "missing_delivery_target" : "missing_run_id",
            });

      const waitResult = await waitResultPromise;
      waitCompleted = true;
      let liveLinkResult = await liveLinkPromise;

      let waitStatus = "unknown";
      try {
        const parsed = JSON.parse(waitResult.stdout || "{}");
        waitStatus = parsed.status || "unknown";
      } catch {
        // ignore parse errors
      }

      const verification = verifyTradeExecution(payload, tradeSessionKey, spawnSyncImpl, opts);
      if (!liveLinkResult.sent && payload.runId && channel && target && verification.createdSource) {
        const recoveredCtx = readStreamContextForRun(payload.runId, {
          streamContextDirPath: opts.streamContextDirPath,
        });
        if (recoveredCtx) {
          const delivery = sendDirectMessage(
            channel,
            target,
            `Watch live: ${recoveredCtx.sourceUrl}`,
            spawnSyncImpl,
            topicId,
          );
          appendAuditEvent(
            {
              type:
                delivery.ok ? "trade_wrapper_live_link_sent" : "trade_wrapper_live_link_failed",
              ...auditBase,
              channel,
              targetHash: hashForAudit(target),
              runIdHash: hashForAudit(payload.runId),
              sourceIdHash: hashForAudit(recoveredCtx.sourceId),
              sourceUrlHash: hashForAudit(recoveredCtx.sourceUrl),
              deliveryMode: "direct_send",
              deliveryPhase: "post_wait_recovery",
              deliveryStatus: delivery.status,
              deliveryReason: delivery.reason,
              deliveryStdout: delivery.stdout,
              deliveryStderr: delivery.stderr,
            },
            { auditLogPath },
          );
          liveLinkResult = {
            attempted: true,
            sent: delivery.ok,
            reason: delivery.reason,
            sourceIdHash: hashForAudit(recoveredCtx.sourceId),
            sourceUrlHash: hashForAudit(recoveredCtx.sourceUrl),
          };
        }
      }
      const verificationMeta = {
        tradeSessionKeyHash: hashForAudit(tradeSessionKey),
        executionConfirmed: verification.confirmed,
        executionConfirmationSource: verification.source,
        runtimeEventTypes: verification.runtimeEventTypes,
        runtimeCreatedSource: verification.createdSource,
        runtimeFinalized: verification.finalized,
        sessionLookupOk: verification.sessionLookupOk,
        sessionLookupReason: verification.sessionLookupReason ?? null,
        sessionLookupStderr: verification.sessionLookupStderr ?? null,
        toolResultCount: verification.toolResultCount,
        assistantToolCallCount: verification.assistantToolCallCount,
        liveLinkAttempted: liveLinkResult.attempted,
        liveLinkSent: liveLinkResult.sent,
        liveLinkReason: liveLinkResult.reason ?? null,
        liveLinkSourceIdHash: liveLinkResult.sourceIdHash ?? null,
        liveLinkSourceUrlHash: liveLinkResult.sourceUrlHash ?? null,
      };
      const finalAssistantMessage =
        waitResult.status === 0 && waitStatus === "ok"
          ? readFinalAssistantMessage(tradeSessionKey, spawnSyncImpl, opts)
          : {
              ok: false,
              reason: "wait_not_completed",
              stderr: null,
              message: "",
            };
      const finalAssistantMeta = {
        finalMessageLookupOk: finalAssistantMessage.ok,
        finalMessageLookupReason: finalAssistantMessage.reason ?? null,
        finalMessageLookupStderr: finalAssistantMessage.stderr ?? null,
        finalMessageHash: finalAssistantMessage.message
          ? hashForAudit(finalAssistantMessage.message)
          : null,
        finalMessageLength: finalAssistantMessage.message.length,
      };

      if (waitResult.error || waitResult.status !== 0) {
        appendAuditEvent(
          {
            type: "trade_wrapper_wait_failed",
            ...auditBase,
            ...verificationMeta,
            ...finalAssistantMeta,
            gatewayRunId: hashForAudit(gatewayRunId),
            waitStatus,
            waitError: waitResult.error ? String(waitResult.error.message || waitResult.error) : null,
            waitStderr: summarizeChildOutput(waitResult.stderr),
            waitStdout: summarizeChildOutput(waitResult.stdout),
            waitExitCode: waitResult.status ?? null,
          },
          { auditLogPath },
        );
      } else if (waitStatus === "ok" && verification.confirmed) {
        appendAuditEvent(
          {
            type: "trade_wrapper_run_completed",
            ...auditBase,
            ...verificationMeta,
            ...finalAssistantMeta,
            gatewayRunId: hashForAudit(gatewayRunId),
            waitStatus,
          },
          { auditLogPath },
        );

        const completionMessage =
          finalAssistantMessage.message ||
          (liveLinkResult.sent
            ? "The /trade run finished. Open the progress link for the final trades."
            : verification.createdSource
              ? "The /trade run finished, but the wrapper could not deliver the progress link automatically."
              : "");
        if (completionMessage && channel && target) {
          const notifyResult = sendWrapperNotice(
            payload,
            completionMessage,
            channel,
            target,
            spawnSyncImpl,
            topicId,
          );
          appendAuditEvent(
            {
              type: notifyResult.ok
                ? "trade_wrapper_final_message_sent"
                : "trade_wrapper_final_message_failed",
              ...auditBase,
              ...verificationMeta,
              ...finalAssistantMeta,
              channel: channel ?? null,
              targetHash: target ? hashForAudit(target) : null,
              noticeHash: hashForAudit(completionMessage),
              noticeMode: notifyResult.mode,
              noticeStatus: notifyResult.status,
              noticeReason: notifyResult.reason,
            },
            { auditLogPath },
          );
        }
      } else if (waitStatus === "ok") {
        appendAuditEvent(
          {
            type: "trade_wrapper_run_unconfirmed",
            ...auditBase,
            ...verificationMeta,
            ...finalAssistantMeta,
            gatewayRunId: hashForAudit(gatewayRunId),
            waitStatus,
          },
          { auditLogPath },
        );
      } else {
        const eventType =
          waitStatus === "timeout" ? "trade_wrapper_run_timeout" : "trade_wrapper_run_error";
        appendAuditEvent(
          {
            type: eventType,
            ...auditBase,
            ...verificationMeta,
            ...finalAssistantMeta,
            gatewayRunId: hashForAudit(gatewayRunId),
            waitStatus,
            waitError: waitResult.error ? String(waitResult.error.message || waitResult.error) : null,
            waitStderr: summarizeChildOutput(waitResult.stderr),
          },
          { auditLogPath },
        );

        let notifyMessage = null;
        if (waitStatus === "timeout" && verification.confirmed && !liveLinkResult.sent) {
          notifyMessage =
            "Still working in the background. I'll send a progress link as soon as it's ready.";
        } else if (waitStatus === "error") {
          notifyMessage =
            "The /trade run hit an internal error before it could finish. Resend the source to retry.";
        }

        if (notifyMessage) {
          const notifyResult = sendWrapperNotice(
            payload,
            notifyMessage,
            channel,
            target,
            spawnSyncImpl,
            topicId,
          );
          appendAuditEvent(
            {
              type: notifyResult.ok ? "trade_wrapper_notice_sent" : "trade_wrapper_notice_failed",
              ...auditBase,
              channel: channel ?? null,
              targetHash: target ? hashForAudit(target) : null,
              noticeHash: hashForAudit(notifyMessage),
              noticeMode: notifyResult.mode,
              noticeStatus: notifyResult.status,
              noticeReason: notifyResult.reason,
            },
            { auditLogPath },
          );
        }
      }
    }

    return 0;
  } finally {
    if (payload.runId) {
      try {
        const cleanup = completeTradeWorkerRun(payload.sessionKey, payload.runId, opts);
        if (cleanup.removed || cleanup.rotated || cleanup.staleRunCount > 0) {
          appendAuditEvent(
            {
              type: "trade_worker_lane_state_updated",
              ...auditBase,
              runIdHash: hashForAudit(payload.runId),
              laneVersion: cleanup.laneVersion,
              laneRunRemoved: cleanup.removed,
              laneRotated: cleanup.rotated,
              laneRemainingCount: cleanup.remainingCount,
              laneStaleRunCount: cleanup.staleRunCount,
            },
            { auditLogPath },
          );
        }
      } catch (error) {
        appendAuditEvent(
          {
            type: "trade_worker_lane_state_cleanup_failed",
            ...auditBase,
            runIdHash: hashForAudit(payload.runId),
            reason: error instanceof Error ? error.message : String(error),
          },
          { auditLogPath },
        );
      }
    }
  }
}
