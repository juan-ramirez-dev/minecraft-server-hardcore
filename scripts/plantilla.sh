#!/bin/bash
# Plantillas de mundo: arrancar siempre desde el mismo mundo (hub + casino construidos, gamerules listas, sin jugadores).
#   plantilla.sh lista                  → plantillas disponibles
#   plantilla.sh guardar <nombre>       → guarda el mundo actual como plantilla (sin datos de jugadores)
#   plantilla.sh restaurar [nombre]     → respalda el mundo actual en backups/ y lo reemplaza por la plantilla
#                                         (por defecto: la más reciente)
# El server debe estar apagado (stop en la consola).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/plantillas"
cd "$ROOT/server"
LEVEL=$(grep '^level-name=' server.properties | cut -d= -f2)
export PATH="/opt/homebrew/bin:$PATH"

server_apagado() {
  if tmux has-session -t mc-hardcore 2>/dev/null || pgrep -f "forge-1.20.1.*nogui" >/dev/null; then
    echo "El server está corriendo. Apágalo primero: scripts/cmd.sh stop"; exit 1
  fi
}

case "$1" in
  lista)
    ls -1t "$DIR"/*.tar.gz 2>/dev/null | while read -r f; do echo "$(basename "$f" .tar.gz)  ($(du -h "$f" | cut -f1))"; done
    ls "$DIR"/*.tar.gz >/dev/null 2>&1 || echo "No hay plantillas"
    ;;
  guardar)
    [ -z "$2" ] && { echo "Uso: plantilla.sh guardar <nombre>"; exit 1; }
    server_apagado
    mkdir -p "$DIR"
    OUT="$DIR/$2.tar.gz"
    [ -e "$OUT" ] && { echo "Ya existe $OUT"; exit 1; }
    tar --exclude='._*' --exclude="$LEVEL/session.lock" --exclude="$LEVEL/playerdata/*" \
      --exclude="$LEVEL/stats/*" --exclude="$LEVEL/advancements/*" -czf "$OUT" "$LEVEL"
    echo "Plantilla: $OUT ($(du -h "$OUT" | cut -f1))"
    ;;
  restaurar)
    server_apagado
    SRC="${2:+$DIR/$2.tar.gz}"
    SRC="${SRC:-$(ls -1t "$DIR"/*.tar.gz 2>/dev/null | head -1)}"
    [ -f "$SRC" ] || { echo "No existe la plantilla: ${2:-(ninguna)}"; exit 1; }
    if [ -d "$LEVEL" ]; then
      BK="$ROOT/backups/antes-de-reset-${LEVEL}-$(date +%Y%m%d-%H%M%S).tar.gz"
      tar --exclude='._*' -czf "$BK" "$LEVEL" && echo "Respaldo del mundo anterior: $BK" || { echo "Falló el respaldo, no se toca nada"; exit 1; }
      rm -rf "$LEVEL"
    fi
    tar -xzf "$SRC"
    find "$LEVEL" -name '._*' -delete 2>/dev/null
    echo "Mundo restaurado desde $(basename "$SRC" .tar.gz). Arranca con scripts/launch-detached.sh"
    ;;
  *)
    sed -n 2,7p "$ROOT/scripts/plantilla.sh" | sed 's/^# \{0,1\}//'
    ;;
esac
