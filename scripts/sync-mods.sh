#!/bin/bash
# Copia los mods del pack (o de la instancia de Modrinth App) a server/mods,
# excluyendo los de client-only.txt y agregando pack/server-only/.
# Uso: sync-mods.sh [carpeta_mods_origen]   (por defecto pack/mods)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/pack/mods}"
DST="$ROOT/server/mods"
PATTERNS=$(grep -v '^#' "$ROOT/client-only.txt" | grep -v '^$')
mkdir -p "$DST"
find "$DST" -maxdepth 1 -name '*.jar' -delete
find "$DST" -maxdepth 1 -name '._*' -delete
for f in "$SRC"/*.jar "$ROOT"/pack/server-only/*.jar; do
  name=$(basename "$f"); [[ "$name" == ._* ]] && continue
  lower=$(echo "$name" | tr '[:upper:]' '[:lower:]'); skip=0
  for p in $PATTERNS; do [[ "$lower" == *"$p"* ]] && skip=1 && echo "  (cliente) $name"; done
  [ $skip = 0 ] && cp -X "$f" "$DST/"
done
find "$DST" -maxdepth 1 -name "._*" -delete
echo "Server mods: $(ls "$DST"/*.jar | wc -l | tr -d ' ') jars"
