#!/bin/bash
# Arranca el server con caffeinate (evita que la Mac duerma) y lo reinicia si se cae.
# Para salir del todo: escribe `stop` en la consola y luego Ctrl+C durante la cuenta atrás.
source "$(dirname "$0")/env.sh"
cd "$ROOT/server"
# exFAT: macOS crea archivos ._* (AppleDouble) que Forge intenta leer como .jar y crashea
find mods config kubejs defaultconfigs -name "._*" -delete 2>/dev/null
while true; do
  caffeinate -dims ./run.sh nogui
  echo "Servidor detenido. Reiniciando en 10s (Ctrl+C para salir)..."
  sleep 10
done
