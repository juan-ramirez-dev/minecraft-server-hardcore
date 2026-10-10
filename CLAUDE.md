# CLAUDE.md — Hardcore Co-op (Forge 1.20.1)

Servidor Minecraft hardcore cooperativo con mecánicas propias en KubeJS. Contexto general: [README.md](README.md),
historial y decisiones: [CHANGELOG.md](CHANGELOG.md), plan original: [plan-server-hardcore.md](plan-server-hardcore.md).

## Comunicación
- Responder en español, **conciso y claro**: qué se hizo, dónde, y qué falta. Sin relleno ni repetir lo obvio.
- Listas cortas o tablas antes que párrafos. Referenciar archivos como `ruta:línea`.
- Si algo falló o no se verificó, decirlo directo.

## Git — obligatorio en cada pedido
Al terminar **cada** cambio pedido: commit + push a `origin main` con la **cuenta personal**.
- Identidad del repo (ya configurada en `.git/config`, no cambiarla):
  `user.name = Juan Ramirez`, `user.email = juan-ramirez-dev@users.noreply.github.com`.
- Remoto: `git@github-personal:juan-ramirez-dev/minecraft-server-hardcore.git` (alias SSH de la cuenta personal).
- `gh`: cuenta activa debe ser `juan-ramirez-dev`. Si no: `gh auth switch -u juan-ramirez-dev`.
- **Nunca** usar la cuenta `juan-ramirez-katapult` ni el correo `@katapultlabs.ai` en este repo.
- Antes de commitear verificar: `git config user.email` → noreply de juan-ramirez-dev.
- Mensajes de commit en español, cortos y descriptivos. Si cambia la versión del pack, actualizar `CHANGELOG.md`.
- No commitear lo que está en `.gitignore` (mundos, backups, jars, JDK, datos de jugadores, `._*`).

## Estructura clave
| Ruta | Qué es |
|---|---|
| `server/kubejs/server_scripts/` | Mecánicas propias (hub, zona segura, casino, caos, alma, espectador) |
| `server/config/` | Configs de mods (In Control, Improved Mobs, voice chat…) |
| `server/server.properties`, `server/user_jvm_args.txt` | Config del server (10 GB, G1) |
| `pack/meta/modrinth-mods.json` | Lista exacta de mods (versión, URL, hashes, lado) |
| `client-only.txt` | Jars que no van al server |
| `scripts/` | start, launch-detached, console, cmd, sync-mods, fetch-mods, build-mrpack, gen-hub, backup, playit |

## Comandos
- Arrancar: `scripts/launch-detached.sh` (tmux `mc-hardcore`) · Consola: `scripts/console.sh` · Comando: `scripts/cmd.sh "list"`
- Recargar scripts KubeJS sin reiniciar: `scripts/cmd.sh "reload"`
- Probar arranque: `scripts/test-boot.sh`
- Mods: `python3 scripts/fetch-mods.py` → `scripts/sync-mods.sh`
- Pack jugadores: `python3 scripts/build-mrpack.py <versión>` → `dist/`
- Java: siempre vía `source scripts/env.sh` (JDK 17 portátil en `jdk/`).

## Reglas del proyecto
- Disco **exFAT**: macOS crea `._*` que rompen Forge/KubeJS. Copiar con `cp -X`; los scripts de arranque los limpian.
- Un solo sistema de escalado de dificultad (Improved Mobs). Respetar la lista de mods descartados del plan.
- Al agregar/quitar mods: actualizar `modrinth-mods.json`, `client-only.txt` si aplica, y `CHANGELOG.md`.
- Construcciones (gen-hub.py): solo bloques vanilla o de mods que tienen los clientes; nunca de `pack/server-only/`.
- No tocar `/Volumes/Z Slim/minecraft/` (otro server).
