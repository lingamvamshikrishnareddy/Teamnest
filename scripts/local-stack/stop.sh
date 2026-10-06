#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
for s in auth postgrest gateway; do
  f=".local-stack/$s.pid"; [[ -f $f ]] && kill "$(cat "$f")" 2>/dev/null && rm -f "$f" && echo "stopped $s"
done
