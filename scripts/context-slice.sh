#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${repository_root}/.codex/skills/vector-lab-harness/scripts/context-slice.sh" "$@"
