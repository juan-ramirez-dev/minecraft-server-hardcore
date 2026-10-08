#!/bin/bash
# Backup manual comprimido del mundo + configs. Hazlo antes de cada sesión y antes de tocar mods.
# Si el server está corriendo, primero en la consola: save-off y save-all (y luego save-on).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"
LEVEL=$(grep '^level-name=' server.properties | cut -d= -f2)
OUT="$ROOT/backups/manual-${LEVEL}-$(date +%Y%m%d-%H%M%S).tar.gz"
tar --exclude='._*' -czf "$OUT" "$LEVEL" config kubejs server.properties whitelist.json ops.json 2>/dev/null
echo "Backup: $OUT ($(du -h "$OUT" | cut -f1))"
