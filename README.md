# Minecraft Hardcore Co-op (Forge 1.20.1)

Servidor hardcore cooperativo **difícil de verdad**: progresión vanilla (Overworld → Nether → End → Dragón) con dificultad que
sube con el tiempo y con cada jefe, Nether y End mucho más peligrosos, y mecánicas propias en KubeJS:

- **Spawn + casino** generados por script, dentro de una **zona segura** (sin mobs, sin daño, no se rompen bloques).
- **Casino**: tragamonedas (1 esmeralda) y Cofre del Destino (8 esmeraldas) con premios de cualquier mod.
- **Eventos del Caos**: de vez en cuando todo se pone peor por unos minutos (creepers cargados, plaga de arañas, asedios,
  phantoms, francotiradores…) y cada 2 lunas llenas, **Furia de la Luna**.
- **Cofre del Alma**: si alguien muere, aparece un cofre (normalmente en una Ciudad Antigua) con un ítem para revivirlo.
- **Espectador restringido**: los muertos solo ven a través de los ojos de un jugador vivo.
- **Alertas en el chat**: aviso cuando alguien queda con ≤ 3 ❤ o usa un Tótem de la Inmortalidad.

Versión actual del pack: **1.1.0** — ver [CHANGELOG.md](CHANGELOG.md). Plan original: [plan-server-hardcore.md](plan-server-hardcore.md).

## Estructura

```
server/                    Servidor Forge 1.20.1-47.4.26 (solo configs y scripts en git)
  config/                  Configs de los mods (In Control, Improved Mobs, voice chat…)
  kubejs/server_scripts/   Mecánicas propias (hub, zona segura, casino, caos, alma, espectador)
  kubejs/data/hardcore_hub Función que construye el spawn + casino (generada)
  server.properties, user_jvm_args.txt
pack/meta/modrinth-mods.json  Lista exacta de mods (versión, URL, hashes, lado)
pack/overrides/            Archivos extra que van dentro del .mrpack (vacío por ahora)
client-only.txt            Jars que NO van al server
scripts/                   start/launch/console/cmd, sync-mods, fetch-mods, build-mrpack, gen-hub, backup, playit
patches/                   Parche local para el agente de playit v1.0.10
dist/LEEME-amigos.txt      Instrucciones para los jugadores
dist/banner/               Banners para jugadores: instalación y roadmap (PNG + HTML fuente)
```

No se versionan: mundos, backups, JDK, librerías de Forge, jars de mods ni datos de jugadores (whitelist, ops).

## Montar el servidor desde cero (macOS, Apple Silicon)

1. JDK 17 portátil en `jdk/` (Temurin 17 aarch64, `.tar.gz` de Adoptium descomprimido ahí). `scripts/env.sh` lo usa.
2. Forge: descargar `forge-1.20.1-47.4.26-installer.jar` y, dentro de `server/`, correr
   `java -jar forge-1.20.1-47.4.26-installer.jar --installServer`.
3. Mods: `python3 scripts/fetch-mods.py` (Modrinth con sha512 + FTB desde CurseForge) y luego `scripts/sync-mods.sh`.
4. `eula=true` en `server/eula.txt` (solo si aceptas el EULA de Minecraft).
5. Arrancar: `scripts/launch-detached.sh` (tmux `mc-hardcore`). Consola: `scripts/console.sh`. Comando suelto: `scripts/cmd.sh "list"`.
6. Primera vez en un mundo nuevo (como op): `/hub construir`, `/op <admin>`, `/whitelist add <jugador>`, y las gamerules del CHANGELOG.

Reiniciar el mundo de prueba (server apagado): `scripts/plantilla.sh restaurar` → vuelve a la plantilla `casino-v1.1.0`
(hub + casino listos, sin jugadores). Guardar otra: `scripts/plantilla.sh guardar <nombre>`.

Pack para jugadores: `python3 scripts/build-mrpack.py 1.1.0` → `dist/Hardcore-Coop-1.1.0.mrpack` (+ zip de mods).

## Comandos de admin

| Comando | Qué hace |
|---|---|
| `/hub construir` · `/hub construir_en <x y z>` · `/hub info` | Construye/repara el lobby + casino (hoy en la montaña: `102 111 850`) |
| `/hub altura <x> <z> <radio> <paso>` · `/hub volcar <x> <z> <radio>` | Exporta relieve/biomas o bloques de superficie a `kubejs/exported/` |
| `/casino validar` · `/casino prueba <n>` | Verifica ítems/tablas de loot · simula tiradas |
| `/caos iniciar <evento>` · `/caos parar` · `/caos estado` · `/caos activar\|desactivar` | Eventos del Caos |
| `/alma forzar` · `/alma estado` · `/alma cancelar` · `/alma dar <jugador>` | Cofre del Alma |
| `/tag <jugador> add espectador_libre` | Libera a un admin del espectador restringido |

## Notas

- Disco exFAT: macOS crea archivos `._*` que rompen Forge y KubeJS; los scripts de arranque los borran.
- KubeJS 6 / Rhino: dentro de funciones usar `var` (`let`/`const` en bucles no se reinicializan), `global` no admite `null`,
  `Math.PI` no existe. Ver CHANGELOG.
- Acceso remoto con playit.gg (agente v1.0.10 compilado con `patches/playitd-v1.0.10-secret-format.patch`).
