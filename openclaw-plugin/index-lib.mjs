import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACK_TEXT,
  MAX_COMMAND_CHARS,
  USAGE_TEXT,
  buildAckText,
  buildWrapperPayload,
  queueTradeWrapper,
  readCommandArg,
} from "./trade-slash-dispatch-lib.mjs";
import {
  appendAuditEvent,
  completeTradeWorkerRun,
  hashForAudit,
  registerTradeWorkerRun,
} from "./run-trade-wrapper-lib.mjs";

export const TRADE_COMMAND_TOOL = "trade_slash_dispatch";
export const WRAPPER_SCRIPT_PATH = fileURLToPath(new URL("./run-trade-wrapper.mjs", import.meta.url));

const tradeDispatchToolSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    command: {
      type: "string",
      description: "Raw /trade arguments (everything after /trade).",
    },
    commandName: {
      type: "string",
      description: "Slash command name.",
    },
    skillName: {
      type: "string",
      description: "Skill name resolved by OpenClaw.",
    },
  },
};

export function createTradeDispatchTool(api, ctx, deps = {}) {
  const queueTradeWrapperImpl = deps.queueTradeWrapperImpl ?? queueTradeWrapper;
  const appendAuditEventImpl = deps.appendAuditEventImpl ?? appendAuditEvent;
  const registerTradeWorkerRunImpl = deps.registerTradeWorkerRunImpl ?? registerTradeWorkerRun;
  const completeTradeWorkerRunImpl = deps.completeTradeWorkerRunImpl ?? completeTradeWorkerRun;
  const existsSyncImpl = deps.existsSyncImpl ?? existsSync;
  return {
    name: TRADE_COMMAND_TOOL,
    label: "Trade Slash Dispatch",
    description:
      "Acknowledge /trade immediately, then hand off the actual trade run to a private per-chat worker lane.",
    parameters: tradeDispatchToolSchema,
    execute: async (_toolCallId, rawArgs) => {
      const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
      const command = readCommandArg(args);
      if (!command) {
        return {
          content: USAGE_TEXT,
          details: {
            status: "usage_error",
            reason: "missing_command",
          },
        };
      }

      if (command.length > MAX_COMMAND_CHARS) {
        return {
          content: `Error: /trade input is too long (${command.length} chars). Max ${MAX_COMMAND_CHARS}.`,
          details: {
            status: "error",
            reason: "input_too_long",
            max: MAX_COMMAND_CHARS,
          },
        };
      }

      const sessionKey = typeof ctx.sessionKey === "string" ? ctx.sessionKey.trim() : "";
      if (!sessionKey) {
        return {
          content: "Error: could not resolve the target chat session for /trade.",
          details: {
            status: "error",
            reason: "missing_session_key",
          },
        };
      }

      let payload;
      const runId = randomUUID().replace(/-/g, "").slice(0, 12);
      try {
        payload = buildWrapperPayload({
          command,
          sessionKey,
          idempotencyKey: `trade-wrapper-${runId}-${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          runId,
        });
      } catch (error) {
        return {
          content: `Error: failed to prepare /trade payload: ${error instanceof Error ? error.message : String(error)}`,
          details: {
            status: "error",
            reason: "payload_build_failed",
          },
        };
      }

      const auditMeta = {
        sourceSessionKeyHash: hashForAudit(sessionKey),
        targetSessionKeyHash: hashForAudit(payload.sessionKey),
        sessionRemapped: payload.sessionKey !== sessionKey,
        targetHash: payload.target ? hashForAudit(payload.target) : null,
        runIdHash: payload.runId ? hashForAudit(payload.runId) : null,
        messageHash: hashForAudit(payload.message),
        messageLength: payload.message.length,
      };
      let registration = null;
      let ackText = ACK_TEXT;

      try {
        if (!existsSyncImpl(WRAPPER_SCRIPT_PATH)) {
          api.logger.warn("trade slash wrapper: wrapper script path missing", {
            ...auditMeta,
            wrapperScriptPath: WRAPPER_SCRIPT_PATH,
          });
          return {
            content: "Error: /trade wrapper script is missing on this host.",
            details: {
              status: "error",
              reason: "missing_wrapper_script",
            },
          };
        }

        registration = registerTradeWorkerRunImpl(payload.sessionKey, runId);
        payload = {
          ...payload,
          laneVersion: registration.laneVersion,
        };
        ackText = buildAckText(registration.aheadCount);

        const result = queueTradeWrapperImpl(payload, { scriptPath: WRAPPER_SCRIPT_PATH });
        if (result.status !== "accepted") {
          completeTradeWorkerRunImpl(payload.sessionKey, runId);
          api.logger.warn("trade slash wrapper: failed to queue /trade handoff", {
            ...auditMeta,
            laneVersion: registration.laneVersion,
            queueDepthAhead: registration.aheadCount,
            exitCode: result.exitCode,
            reason: result.reason,
          });
          return {
            content: "Error: failed to queue /trade handoff.",
            details: {
              status: "error",
              reason: "handoff_failed",
              exitCode: result.exitCode,
            },
          };
        }

        api.logger.info("trade slash wrapper: queued /trade handoff", {
          ...auditMeta,
          laneVersion: registration.laneVersion,
          queueDepthAhead: registration.aheadCount,
          childPid: result.pid ?? null,
        });
        appendAuditEventImpl({
          type: "trade_wrapper_ack_sent",
          ...auditMeta,
          laneVersion: registration.laneVersion,
          queueDepthAhead: registration.aheadCount,
          ackLength: ackText.length,
        });
      } catch (error) {
        if (registration) {
          try {
            completeTradeWorkerRunImpl(payload.sessionKey, runId);
          } catch {
            // Best effort rollback only.
          }
        }
        api.logger.warn("trade slash wrapper: failed to queue /trade handoff", {
          ...auditMeta,
          laneVersion: registration?.laneVersion ?? null,
          queueDepthAhead: registration?.aheadCount ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: `Error: failed to queue /trade: ${error instanceof Error ? error.message : String(error)}`,
          details: {
            status: "error",
            reason: "queue_failed",
          },
        };
      }

      return {
        content: ackText,
        details: {
          status: "accepted",
          targetSessionKeyHash: hashForAudit(payload.sessionKey),
          sessionRemapped: payload.sessionKey !== sessionKey,
          runId: payload.runId ?? null,
          laneVersion: registration?.laneVersion ?? null,
          queueDepthAhead: registration?.aheadCount ?? 0,
        },
      };
    },
  };
}
