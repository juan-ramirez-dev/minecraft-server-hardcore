# CHANGELOG — Hardcore Coop

## 2026-10-07 — Fase 1–3 (base del servidor + pack de mods v1.0.0)

### Estructura (disco externo Z Slim, exFAT)
- `/Volumes/Z Slim/mc-hardcore/` (separado de `/Volumes/Z Slim/minecraft/`, el server Pokémon, que no se tocó).
- `jdk/` — Temurin 17.0.20.1+1 aarch64 **portátil** (sin instalar en el sistema; sha256 verificado). Lo carga `scripts/env.sh`.
- `server/` — Forge 1.20.1-47.4.26 (installer sha1 verificado). EULA aceptado por el usuario el 2026-10-07.
- `pack/mods/` — 48 jars para clientes (37 ambos lados + 11 solo cliente). `pack/server-only/` — 4 jars solo server.
- `pack/meta/modrinth-mods.json` — versión, URL y hashes de cada mod de Modrinth.
- `tools/jar-store/` — caché de descargas; `tools/forge-*-installer.jar`.
- `dist/` — `Hardcore-Coop-1.0.0.mrpack`, `Hardcore-Coop-1.0.0-mods.zip`, `LEEME-amigos.txt`.

### Configuración
- `server.properties`: hardcore=true, difficulty=hard, whitelist forzada, online-mode, view 8 / sim 6, max 8, spawn-protection 0,
  `allow-flight=true` (evita kicks por mobs/jefes que lanzan por el aire), `max-tick-time=-1` (sin watchdog durante pregeneración).
  `level-name=world_test` (mundo de prueba para Fase 4; pasar a `world` en Fase 7).
- `user_jvm_args.txt`: 10 GB + flags G1 del plan, **sin** `G1RSetUpdatingPauseIntervalMillis` (eliminado en Java 17, impedía arrancar).

### Scripts
- `start.sh` (caffeinate + reinicio), `launch-detached.sh` (tmux `mc-hardcore`), `cmd.sh`, `console.sh`, `test-boot.sh`,
  `sync-mods.sh` (pack/mods → server/mods excluyendo `client-only.txt` + server-only), `backup.sh`, `build-mrpack.py`.

### Problema exFAT
- macOS crea `._*` (AppleDouble) al escribir en exFAT. Forge los intenta abrir como .jar (crash "zip END header not found")
  y KubeJS como scripts. `start.sh`/`test-boot.sh` los borran de `mods/ config/ kubejs/ defaultconfigs/` antes de cada arranque;
  `sync-mods.sh` copia con `cp -X`.

### Mods (versiones resueltas para Forge 1.20.1)
Revivir: Reviver Mod 2.0.0 · Dificultad: Improved Mobs 1.13.7 (+TenshiLib), Champions-Unofficial 20.1.1.6, In Control! 9.5.0 (solo server),
Enhanced Celestials 5.0.3.3 (+CorgiLib, Data Anchor), Tough As Nails 9.2.0.171 (+GlitchCore) · Jefes: L_Ender's Cataclysm 3.31 (+Lionfish API 3.0, Curios),
Mowzie's Mobs 1.8.2 (+GeckoLib 4.8.4), Born in Chaos 1.7.5 · Estructuras: YUNG's API + Better Dungeons/Strongholds/Nether Fortresses/End Island ·
Quests: FTB Quests 2001.4.22, FTB Library 2001.2.13, FTB Teams 2001.3.2 (CurseForge, embebidos en el .mrpack) ·
Scripts: KubeJS 2001.6.5-build.26, Rhino, Architectury 9.2.14 · QoL: JEI, Jade, Xaero's Minimap + World Map, Sophisticated Backpacks + Core,
Simple Voice Chat 2.6.22, AppleSkin · Rendimiento: ModernFix, FerriteCore, Spark; solo server: Canary, Chunky, Simple Backups ·
Solo cliente: Embeddium, Oculus, Sodium Dynamic Lights (+Sodium Options API), Better Zoom 2.9.0, Fusion, EMF, ETF, EntityCulling, ImmediatelyFast, Dynamic FPS.

### Verificación
- Arranque vanilla Forge: Done (12.0s). Arranque con los 41 mods del server: Done (13.2s), sin errores salvo los `._*` ya resueltos.

### Pendiente (fases siguientes)
- Fase 3: probar el .mrpack en un cliente real (importar en Modrinth App y conectar).
- Fase 4: ciclo muerte/revivir con Reviver Mod. Fase 5: scripts KubeJS + In Control + recetas. Fase 6: quests. Fase 7: mundo final, Chunky, playit.gg, voz.

### Arranque en producción (2026-10-07 17:23)
- Server corriendo en tmux `mc-hardcore` (tmux instalado con Homebrew; el `screen` de macOS falla con nombres de usuario largos).
- Escuchando TCP 25565 y UDP 24454 (Simple Voice Chat). `gamerule playersSleepingPercentage 100` aplicado en world_test.

## 2026-10-07 — Fix: espectadores no cargaban mundo
- `spectatorsGenerateChunks` estaba en `false` en world_test (vanilla es `true`; probablemente lo cambió un mod). Puesto en `true`.
  Necesario porque en hardcore los muertos quedan en espectador. [VERIFICAR qué mod lo cambia y repetir el gamerule en el mundo final]

## 2026-10-07 — Fase 7 (parcial): acceso remoto con playit.gg
- El agente 0.17.1 que había en `/Volumes/Z Slim/playit-agent/` ya no funciona con la API actual. Se compiló la v1.0.10 oficial
  (`/Volumes/Z Slim/playit-agent-1.0.10/`, Rust vía Homebrew) con un **parche local** en `packages/playitd/src/daemon.rs`
  (`validate_secret`): v1.0.10 exige clave hex y playit.gg ya emite claves con `_`/`-`. Si se actualiza playit, verificar si ya lo arreglaron.
- `scripts/playit.sh` arranca `playitd` en tmux `playit` (log: `server/logs/playit.log`). Clave en `~/Library/Application Support/playit_gg/playit.toml`.
- Túneles (sin Proxy Protocol): Minecraft Java → 127.0.0.1:25565 = **fried-wheat.tun.ply.gg** (SRV → puerto 29517);
  UDP → 127.0.0.1:24454 = **fried-chat.tun.ply.gg:29525**.
- `voice_host=fried-chat.tun.ply.gg:29525` en `config/voicechat/voicechat-server.properties` (backup en `backups/`).
- Verificado: ping de estado del server por el túnel público OK (1.20.1, MOTD correcto).

## 2026-10-07 21:48 — Mundo definitivo
- Pruebas en world_test OK (según el usuario). Backup: `backups/world_test-final-20261007-214801.tar.gz` (100 MB); world_test eliminado.
- `level-name=world`, mundo nuevo generado (Done 10.6s). Gamerules: spectatorsGenerateChunks true, playersSleepingPercentage 100,
  keepInventory false, doImmediateRespawn false. Whitelist: thisMonje, janzers. ops.json vacío
  (un `op list` accidental se revirtió de inmediato con `deop list`).
- Pendiente: pregenerar con Chunky (overworld 4000, nether 1500).
- 2026-10-07 22:23: thisMonje y janzers murieron congelados (22:20, spawn ~17 64 -25). Revividos por comando a pedido del usuario (tp al punto de muerte + gamemode survival).

## 2026-10-07 23:15 — v1.1.0: sin sed/temperatura, Nether/End difíciles, spawn + casino, Eventos del Caos, Cofre del Alma
Backup del mundo v1.0: `backups/world-v1.0-20261007-224531/` (+ .tar.gz). Mundo nuevo `world` (hub en 0 70 416, bosque de flores).

### Mods
- Quitados: Tough As Nails, GlitchCore (y sus ítems en `config/improvedmobs/equipment.json`; backup en `backups/`).
- Agregados (ambos lados): Incendium 5.3.5, True Ending 1.1.0c, Nullscape 1.2.8.
- Agregados (solo server, `pack/server-only/`): YUNG's Better Mineshafts / Ocean Monuments / Desert Temples / Jungle Temples / Witch Huts,
  Dungeons and Taverns 3.0.3.f, Explorify 1.6.5, Moog's End Structures 2.1.0 + Moog's Structure Lib 3.4.2.
- Pack: `dist/Hardcore-Coop-1.1.0.mrpack` (46 por referencia + 3 FTB embebidos) y `-mods.zip` (49 jars). Server: 51 jars.

### Dificultad
- `config/incontrol/spawn.json` (`"when": "onjoin"`): Nether hostiles vida ×1.5, daño ×1.5, velocidad ×1.1; End vida ×2, daño ×1.75.
  Verificado: zombie piglin 20→30 de vida, y no se acumula tras reiniciar.
- Champions no tiene configuración por dimensión → sin cambios (10% global).

### KubeJS (todo en `server/kubejs/server_scripts/`, solo server: los clientes no necesitan nada)
- `hub_layout.js` + `kubejs/data/hardcore_hub/functions/build.mcfunction`: generados por `scripts/gen-hub.py` (plaza 31×31 + casino 23×21).
- `hub_core.js`: `/hub construir` (en el spawn; si ya existe, repara en el mismo lugar), `/hub construir_en <pos>`, `/hub info`, `/hub diag`.
- `safe_zone.js`: zona = hub + 8 bloques. Sin hostiles (cancelar aparición + barrido cada 1 s), sin daño a jugadores, nadie rompe/pone
  (salvo op en creativo), sin explosiones/rayos/TNT, sin baldes/fuego/entidades colocables/perlas. Verificado con summons.
- `casino.js`: tragamonedas 1 esmeralda (nada 45 / común 30 / raro 18 / épico 6 / jackpot 1 %), Cofre del Destino 8 esmeraldas.
  29 tablas de loot "raro" y 15 "destino" de 9 mods, auditadas sin netherite/materiales de jefe/tótems/élitros.
  `/casino validar` (todo existe), `/casino prueba <n>` (distribución verificada con 10 000 tiradas).
- `chaos_events.js`: tormenta, cacería, plaga, asedio, cielo (solo noche), francotiradores + Furia de la Luna (cada 2 lunas llenas).
  `/caos iniciar|parar|estado|activar|desactivar`. Verificado: creepers cargados y descargados al terminar, arco Poder III
  y restaurado, Fuerza II + Velocidad, follow range 35→70→35.
- `soul_chest.js`: Cofre del Alma (Ciudad Antigua vía `findNearestMapStructure`, plan B cámara con spawners), 45 min, bossbar,
  Corazón del Alma = heart_of_the_sea con NBT `SoulHeart`. `/alma forzar|estado|cancelar|dar`. Verificado: cofre en el centro de
  una Ciudad Antigua a ~2800 bloques, NBT válido.
- `spectator.js`: los muertos solo ven a través de un vivo (Shift cambia); sin vivos, quedan fijos en el spawn. Tag `espectador_libre` para admins.
- Lecciones Rhino (KubeJS 6): `global` no admite null; `let`/`const` dentro de bucles no se reinicializan (usar `var`);
  `Math.PI` no existe; `level.getGameTime()` no está mapeado (usar `getLevelData().getGameTime()`); DamageSource → `.actual`.

### Mundo
- Gamerules: spectatorsGenerateChunks true, playersSleepingPercentage 100, keepInventory false, doImmediateRespawn false, spawnRadius 0.
- `op thisMonje` (necesario para que funcione la protección de spawn vanilla y para los comandos de admin).

### Sin verificar con un jugador real (no se puede desde la consola)
- Clic en tragamonedas/cofre con esmeraldas, usar el Corazón del Alma renombrado, espectador pegado a un vivo,
  bloqueo de baldes/romper bloques por un jugador. Probarlo en la primera sesión.

## 2026-10-09 — Alertas en el chat
- `player_alerts.js`: aviso a todos cuando un jugador queda con ≤ 3 ❤ (se rearma al pasar de 5 ❤) y cuando usa un Tótem de la
  Inmortalidad (objetivo `hc_totem`, estadística `minecraft.used:minecraft.totem_of_undying`). Incluye coordenadas y dimensión.
- Verificado: carga sin errores en arranque de prueba. Sin probar con un jugador real.

## 2026-10-09 — Plantilla de mundo + banner de instalación
- `scripts/plantilla.sh lista|guardar <nombre>|restaurar [nombre]`: guarda/restaura el mundo (sin datos de jugadores).
  Restaurar respalda antes el mundo actual en `backups/antes-de-reset-*`. Plantillas en `plantillas/` (no se versiona).
- Plantilla `casino-v1.1.0` (6.9 MB): mundo v1.1.0 con hub + casino en 0 70 416 y gamerules listas, sin jugadores.
  Verificado: guardar → restaurar deja el mundo idéntico.
- `dist/banner/banner-instalacion.png` (+ .html fuente): instalación con Modrinth App o launcher oficial + IP del server.
- `dist/banner/banner-roadmap.png` (+ .html): qué hay en el server, qué viene (plan pendiente) y preguntas de feedback.

## 2026-10-10 — Lobby y casino rediseñados
- `scripts/gen-hub.py` reescrito (4369 comandos). Bloques de Cataclysm y Born in Chaos (los tienen todos los clientes).
  - Plaza octogonal: arcos de entrada, fuente de piedra marina azul con cascada, 4 jardines con cerezo, bancos,
    faroles de argilita, tablero de reglas con murales. Spawn al sur de la fuente mirando al norte (`0 1 9`, ángulo 180).
  - Casino 29×25: fachada escalonada negra/dorada con letrero CASINO iluminado, marquesina, ventanales escarlata,
    rosetón morado, artesonado con luces, candelabros, 4 mesas de cartas, 8 tragamonedas (antes 6) y altar de obsidiana
    para el Cofre del Destino (ahora en `46 3 0`). Zona segura: x -25..58, z ±25.
- `python3 scripts/gen-hub.py --preview <dir>`: planta + fachada en HTML para revisar sin entrar al juego.
- Verificado en el server: la función carga, `/hub construir` OK, 19 bloques clave comprobados con `execute if block`,
  `/casino validar` OK. Plantilla nueva: `lobby-v2` (la usa `plantilla.sh restaurar` por defecto).

## 2026-10-10 — Hub en la montaña: casino neoclásico + lobby sencillo
- Ubicación: ladera de un bosque de cerezos, origen `102 111 850` (la montaña llega a ~129). Spawn `102 112 867`
  mirando al casino. Elegido con un mapa de alturas y biomas (`/hub altura`) buscando poco movimiento de tierra,
  montaña detrás y vista al frente.
- `scripts/gen-hub.py` reescrito (`--rot N` para orientar el frente):
  - Casino estilo neoclásico (blanco + ladrillo rojo): pórtico de 6 columnas con estandartes, entablamento con luces,
    pabellones con ventanal, panel escarlata, balcón y agujas; escalinata con divisores blancos y jardines escalonados
    de setos y flores rojas; explanada con 2 fuentes. Interior: 8 tragamonedas, 4 mesas de cartas, candelabros,
    tragaluz, rosetón morado y altar de obsidiana del Cofre del Destino.
  - Lobby: claro con arcos de hojas, estanque con puente, terraza de madera y poste con faroles.
  - Terreno: el casino va en una terraza 5 bloques sobre el lobby; alrededor se recorta/rellena en pendiente con pasto.
- `hub_core.js`: `/hub construir` fuerza la carga de los chunks de la obra antes de construir (lejos del spawn fallaba).
  Nuevos `/hub altura <x> <z> <radio> <paso>` y `/hub volcar <x> <z> <radio>` → `kubejs/exported/` (relieve/superficie).
- Verificado en el server: 15/15 bloques clave, `/casino validar` OK, vistas aéreas renderizadas del volcado.
- Plantilla: `montana-v1`. El hub anterior (`0 70 416`) sigue en el mundo: pendiente decidir cómo quitarlo.
