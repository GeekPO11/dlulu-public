#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[check:full] Running full unit/integration test suite..."
npm test -- --run

echo "[check:full] Complete."
