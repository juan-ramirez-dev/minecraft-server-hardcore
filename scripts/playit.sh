#!/bin/bash
# Arranca el daemon de playit v1.0.10 (compilado en /Volumes/Z Slim/playit-agent-1.0.10) en tmux "playit".
# Ver su consola: tmux attach -t playit   (salir sin cerrarlo: Ctrl+B y luego D). Log: server/logs/playit.log
export PATH="/opt/homebrew/bin:$PATH"
BIN="/Volumes/Z Slim/playit-agent-1.0.10/target/release/playitd"
SECRET="$HOME/Library/Application Support/playit_gg/playit.toml"
LOG="$(cd "$(dirname "$0")/.." && pwd)/server/logs/playit.log"
if tmux has-session -t playit 2>/dev/null; then echo "playit ya está corriendo: tmux attach -t playit"; exit 1; fi
tmux new-session -d -s playit "while true; do \"$BIN\" --secret-path \"$SECRET\" --socket-path /tmp/playitd.sock 2>&1 | tee -a \"$LOG\"; echo 'playit terminó, reiniciando en 10s'; sleep 10; done"
echo "playit arrancado en tmux 'playit'"
