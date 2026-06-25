#!/usr/bin/env bash
# Compile the Compact contract from source and stage its artifacts:
#   - generated TS module + zk keys  -> src/contract/managed/registry  (web app imports this)
#   - prover/verifier/zkir keys      -> public/zk                       (browser FetchZkConfigProvider)
#   - a copy of the managed dir      -> deploy-kit/managed/registry     (CLI imports this)
#
# Requires the Compact toolchain (`compact`) on PATH. See README › Prerequisites.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

SRC="src/contract/registry.compact"
OUT="src/contract/managed/registry"

echo "→ compiling $SRC (compiler 0.31 for language 0.23)"
rm -rf "$OUT"
compact compile +0.31.0 "$SRC" "$OUT"

echo "→ staging zk keys to public/zk"
rm -rf public/zk
mkdir -p public/zk/keys public/zk/zkir
cp "$OUT"/keys/*.prover "$OUT"/keys/*.verifier public/zk/keys/
cp "$OUT"/zkir/*.bzkir public/zk/zkir/

echo "→ copying compiled module to deploy-kit/managed"
rm -rf deploy-kit/managed
mkdir -p deploy-kit/managed
cp -r "$OUT" deploy-kit/managed/registry

echo "✓ contract compiled and staged"
