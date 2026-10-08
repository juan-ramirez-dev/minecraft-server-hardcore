#!/bin/bash
# Envía un comando a la consola del server sin abrirla. Ej: scripts/cmd.sh "whitelist add Juan"
export PATH="/opt/homebrew/bin:$PATH"
tmux send-keys -t mc-hardcore "$*" Enter
