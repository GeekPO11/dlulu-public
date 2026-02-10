#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[check:critical] Running high-risk regression suites..."
npm test -- --run \
  tests/onboarding.test.tsx \
  tests/onboarding-flow.test.tsx \
  tests/status-check.test.tsx \
  tests/landing-page.test.tsx \
  tests/reset-password.test.tsx \
  tests/app-routing.test.tsx

echo "[check:critical] Complete."
