#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_PATH="${ROOT_DIR}/openclaw-plugin"
PLUGIN_ID="trade-slash-wrapper"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw CLI is required but not found on PATH." >&2
  exit 1
fi

if [[ ! -f "${PLUGIN_PATH}/openclaw.plugin.json" ]]; then
  echo "Missing plugin manifest at ${PLUGIN_PATH}/openclaw.plugin.json" >&2
  exit 1
fi

if [[ ! -f "${PLUGIN_PATH}/package.json" ]]; then
  echo "Missing plugin package at ${PLUGIN_PATH}/package.json" >&2
  exit 1
fi

merge_allowlist() {
  local existing_allow merged_allow
  existing_allow="$(openclaw config get plugins.allow 2>/dev/null || true)"

  if [[ -z "${existing_allow//[[:space:]]/}" ]]; then
    openclaw config set plugins.allow "[\"${PLUGIN_ID}\"]" --strict-json >/dev/null
    return
  fi

  merged_allow="$(EXISTING_ALLOW="${existing_allow}" PLUGIN_ID="${PLUGIN_ID}" node <<'NODE'
const raw = process.env.EXISTING_ALLOW ?? "";
const pluginId = process.env.PLUGIN_ID ?? "";
try {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    process.stdout.write("");
    process.exit(0);
  }
  if (!parsed.includes(pluginId)) {
    parsed.push(pluginId);
  }
  process.stdout.write(JSON.stringify(parsed));
} catch {
  process.stdout.write("");
}
NODE
)"

  if [[ -z "${merged_allow}" ]]; then
    echo "plugins.allow is not valid JSON array. Please add ${PLUGIN_ID} manually." >&2
    return
  fi

  openclaw config set plugins.allow "${merged_allow}" --strict-json >/dev/null
}

echo "Installing OpenClaw wrapper plugin from ${PLUGIN_PATH}"
openclaw plugins install --link "${PLUGIN_PATH}"
merge_allowlist

echo "Restarting OpenClaw gateway"
openclaw gateway restart

echo "Wrapper setup complete. Verify with:"
echo "  openclaw plugins info ${PLUGIN_ID}"
echo "  openclaw skills info trade"
