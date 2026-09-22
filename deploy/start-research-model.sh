#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON_BIN="${PYTHON_BIN:-/root/amazinglab/.venv-vllm/bin/python}"
exec "$PYTHON_BIN" -m research_model.service

