#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs npm dependencies so builds, lint and typecheck work in remote sessions.
set -euo pipefail

# Only run in the remote (web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# onnxruntime-node's postinstall tries to download optional GPU (CUDA/DML)
# binaries from api.nuget.org, which fails behind the remote proxy. The app only
# needs the CPU runtime that ships in the package, so skip that download.
export ONNXRUNTIME_NODE_INSTALL=skip
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export ONNXRUNTIME_NODE_INSTALL=skip' >> "$CLAUDE_ENV_FILE"
fi

npm install --no-audit --no-fund
