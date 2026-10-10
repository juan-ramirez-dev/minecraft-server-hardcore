# CLAUDE.md — KubeJS (6 / Rhino, Forge 1.20.1)

Reglas al editar `server_scripts/`:
- Dentro de funciones usar `var`: `let`/`const` en bucles no se reinicializan en Rhino.
- `global` no admite `null`. `Math.PI` no existe (usar `3.141592653589793`).
- Estado persistente en `server.persistentData`, no en variables globales.
- `e.cancel()` termina el handler en KubeJS 6: siempre al final, nunca con código después.
- `data/hardcore_hub/` es **generado** por `scripts/gen-hub.py` — editar el generador, no el output.
- Tras cambios: `scripts/cmd.sh "reload"` y revisar `server/logs/kubejs/server.log` por errores.
- Verificar comandos admin afectados (`/hub`, `/casino`, `/caos`, `/alma`) — ver tabla en el README raíz.
