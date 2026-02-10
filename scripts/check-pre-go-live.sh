#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[check:pregolive] Step 1/3: Critical regression checks"
bash scripts/check-critical.sh

echo "[check:pregolive] Step 2/3: Full test suite"
bash scripts/check-full.sh

echo "[check:pregolive] Step 3/3: Production build"
npm run build

echo "[check:pregolive] All checks passed."
