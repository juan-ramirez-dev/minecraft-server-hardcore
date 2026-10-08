#!/bin/bash
# Arranque de prueba: inicia el server, espera "Done" o un crash, y lo detiene. Uso: test-boot.sh [timeout_s]
source "$(dirname "$0")/env.sh"
cd "$ROOT/server"
# exFAT: macOS crea archivos ._* (AppleDouble) que Forge intenta leer como .jar y crashea
find mods config kubejs defaultconfigs -name "._*" -delete 2>/dev/null
TO=${1:-600}
FIFO=$(mktemp -u /tmp/mcin.XXXX); mkfifo "$FIFO"
( ./run.sh nogui < "$FIFO" > boot-test.out 2>&1; echo "EXIT $?" >> boot-test.out ) &
exec 3>"$FIFO"
for i in $(seq 1 $TO); do
  sleep 1
  if grep -q 'Done (' boot-test.out; then echo "BOOT OK en ${i}s"; grep 'Done (' boot-test.out; echo stop >&3; break; fi
  if grep -q '^EXIT' boot-test.out; then echo "SERVER TERMINÓ SIN 'Done'"; break; fi
done
wait; exec 3>&-; rm -f "$FIFO"
tail -3 boot-test.out
