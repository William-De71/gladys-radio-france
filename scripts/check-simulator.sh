#!/usr/bin/env bash
# Run the real integration over HTTP against the fake Radio France Open API
# (scripts/fake-openapi.mjs), in the three schema shapes the client knows:
# the `live` query as documented, `live` without BlankStep, and no `live` at
# all (the program grid). No key, no network beyond 127.0.0.1.
#
# The fake answers with the shapes of the documentation and of the projects
# that use the API (see NOTICE); it cannot prove the real schema, which only
# a key can read.
set -euo pipefail
cd "$(dirname "$0")/.."
port=18781
trap 'kill "${fake_pid:-0}" 2>/dev/null || true' EXIT
for schema in union diffusion-only no-live; do
  node scripts/fake-openapi.mjs "$port" "--schema=$schema" >/dev/null &
  fake_pid=$!
  for _ in $(seq 1 50); do
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && break
    sleep 0.1
  done
  echo "# schema: $schema"
  node scripts/simulate.mjs "http://127.0.0.1:$port"
  kill "$fake_pid"
  wait "$fake_pid" 2>/dev/null || true
done
echo "the integration works against the fake Open API in every shape"
