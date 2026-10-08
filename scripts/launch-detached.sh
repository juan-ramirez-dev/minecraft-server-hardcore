#!/bin/bash
# Arranca start.sh dentro de una sesión tmux "mc-hardcore" en segundo plano (sobrevive a cerrar la terminal).
export PATH="/opt/homebrew/bin:$PATH"
if tmux has-session -t mc-hardcore 2>/dev/null; then echo "Ya está corriendo. Consola: scripts/console.sh"; exit 1; fi
tmux new-session -d -s mc-hardcore "\"$(cd "$(dirname "$0")" && pwd)/start.sh\""
echo "Server arrancando en tmux 'mc-hardcore'. Consola: scripts/console.sh"
