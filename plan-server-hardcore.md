# Server Minecraft Hardcore Co-op — Plan completo

> Resumen del plan original entregado el 2026-10-07. **Ubicación real del proyecto: `/Volumes/Z Slim/mc-hardcore/`** (disco externo, exFAT),
> no `~/mc-hardcore`. Java es un JDK 17 portátil en `jdk/` (ver `scripts/env.sh`), no el cask de Homebrew.
> El estado real de cada fase está en `CHANGELOG.md`.
> **v1.1.0:** se quitó Tough As Nails (sed/temperatura); el Nether/End se endurecen con Incendium, True Ending, Nullscape, MES e In Control.
> Se agregaron spawn + casino, Eventos del Caos, Cofre del Alma y espectador restringido (ver README y CHANGELOG).

## 1. Objetivo
Hardcore cooperativo difícil de verdad, progresión vanilla (Overworld → Nether → End → Dragón) pero:
1. La dificultad sube con el avance — por tiempo jugado y por jefes derrotados.
2. Morir es morir: espectador; solo los demás reviven (ítem caro + renombrar en yunque con el nombre del muerto + altar).
3. Motivo real para netherite: jefes del Nether exigen netherite; sus drops son necesarios para llegar al End y para revivir.
4. Nada de minerales nuevos en el Overworld; materiales nuevos solo de jefes (Cataclysm).
5. Nether más peligroso: multiplicadores de mobs, fuego/lava ×2, calor (Tough As Nails), fortalezas más grandes.
6. Sin tumbas, sin mods de animaciones de combate, sin dimensiones extra con materiales propios, sin viaje rápido.
7. QoL mínima: minimapa, mochilas, JEI, y reemplazos de OptiFine.

Decisiones: MC 1.20.1 + Forge 47.4.x · Java 17 ARM64 · Modrinth App / .mrpack · Mac M4 16 GB dedicada (10 GB server) ·
playit.gg (TCP 25565 + UDP 24454) · sin OptiFine.

## 2. Mods
Ver `CHANGELOG.md` y `pack/meta/modrinth-mods.json` para las versiones exactas instaladas.
Un solo sistema de escalado global (Improved Mobs). No Flashables. No dos mods de luz dinámica.
Descartados: Hardcore Revival, Corail Tombstone/GraveStone, Better Combat/Simply Swords/Epic Fight, Twilight Forest, Alex's Mobs,
Deeper and Darker, Iron's Spells, Ice and Fire, Pufferfish's Skills, Farmer's Delight, Spice of Life, Waystones, Serene Seasons, OptiFine.

## 3. Mecánicas a construir (KubeJS + configs)

### 3.1 Dificultad por jefe derrotado
Al morir un jefe (solo la primera vez, guardado en `server.persistentData`) sube la dificultad de Improved Mobs y se anuncia.
| Jefe | ID [VERIFICAR] | Bono |
|---|---|---|
| Elder Guardian | minecraft:elder_guardian | +10 |
| Warden | minecraft:warden | +20 |
| Wither | minecraft:wither | +30 |
| Ignis | cataclysm:ignis | +30 |
| Netherite Monstrosity | cataclysm:netherite_monstrosity | +30 |
| Ender Guardian | cataclysm:ender_guardian | +25 |
| Ender Dragon | minecraft:ender_dragon | +40 |
| The Harbinger | cataclysm:the_harbinger | +30 |
| The Leviathan | cataclysm:the_leviathan | +30 |
| Ancient Remnant | cataclysm:ancient_remnant | +25 |
| Maledictus | cataclysm:maledictus | +30 |
| Scylla | cataclysm:scylla | +30 |
| Frostmaw | mowziesmobs:frostmaw | +15 |
| Ferrous Wroughtnaut | mowziesmobs:ferrous_wroughtnaut | +15 |
| Umvuthi | mowziesmobs:umvuthi | +15 |
| Sculptor | mowziesmobs:sculptor | +15 |

Borrador `kubejs/server_scripts/boss_difficulty.js`:
```js
// [VERIFICAR] prefijo del comando de Improved Mobs
const DIFF_CMD = 'improvedmobs difficulty add'
const BOSS_BONUS = { /* tabla de arriba */ }
EntityEvents.death(event => {
  const id = String(event.entity.type)
  const bonus = BOSS_BONUS[id]
  if (!bonus) return
  const data = event.server.persistentData
  const key = 'boss_killed_' + id.replace(':', '_')
  if (data.getBoolean(key)) return
  data.putBoolean(key, true)
  event.server.runCommandSilent(`${DIFF_CMD} ${bonus}`)
  event.server.tell(Text.red(`☠ ${event.entity.name.string} ha caído. El mundo se vuelve más hostil (+${bonus}).`))
})
```

### 3.2 Fuego y lava ×2 en el Nether
`kubejs/startup_scripts/nether_fire.js` (eventos Forge en startup; requiere reinicio):
```js
// [VERIFICAR] ForgeEvents.onEvent en startup y nombres de métodos con mappings 1.20.1
const Player = Java.loadClass('net.minecraft.world.entity.player.Player')
const FIRE_TYPES = ['inFire', 'onFire', 'lava', 'hotFloor']
const MULT = 2.0
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingHurtEvent', event => {
  const entity = event.getEntity()
  if (!(entity instanceof Player)) return
  if (entity.level().dimension().location().toString() !== 'minecraft:the_nether') return
  if (FIRE_TYPES.indexOf(String(event.getSource().getMsgId())) === -1) return
  event.setAmount(event.getAmount() * MULT)
})
```

### 3.3 Multiplicadores (In Control!) — `config/incontrol/spawn.json` [VERIFICAR claves]
Nether: hostiles vida ×1.5, daño ×1.5, velocidad ×1.1. End: vida ×1.75, daño ×1.5. `"result": "default"`.

### 3.4 Ojo de Ender exige jefe del Nether
Quitar receta vanilla; `3x minecraft:ender_eye` = PBP/BIB/PBP con P=ender_pearl, B=blaze_powder, I=`cataclysm:ignitium_ingot` [VERIFICAR].

### 3.5 Revivir caro
IDs reales de Reviver Mod con `/kubejs hand` + JEI [VERIFICAR]. Totem = GNG/ETE/GNG (ghast_tear, netherite_ingot, echo_shard, totem_of_undying).
Altar = OSO/CBC/OOO (crying_obsidian, nether_star, respawn_anchor, beacon).
Flujo: craftear totem → renombrar en yunque con el nombre exacto del muerto → usar en el altar → vuelve a survival.
Plan B (si falla con hardcore=true): ítem propio en KubeJS + altar (lodestone sobre crying obsidian), busca al espectador por nombre,
lo pone en survival, lo teletransporta, debuffs 5 min, consume el ítem y anuncia.

### 3.6 Reglas de mundo
server.properties: hardcore, hard, whitelist forzada, online-mode, view 8, sim 6, max 8, spawn-protection 0.
Gamerules: keepInventory false, doImmediateRespawn false, playersSleepingPercentage 100.

### 3.7 FTB Quests (capítulos)
1 Sobrevivir · 2 Preparación · 3 El Nether (aviso fuego ×2) · 4 Señores del Nether (Ignis, Netherite Monstrosity) ·
5 El Wither (Nether Star → altar) · 6 Las profundidades (echo shards, Warden opcional) · 7 El End (Ender Guardian → Dragón) ·
8 Endgame (resto de Cataclysm y Mowzie's). Recompensas modestas.

## 4. Servidor
- RAM: 10 GB server (`server/user_jvm_args.txt`); jugadores 6–8 GB.
- Mac dedicada: enchufada, tapa abierta, "Evitar reposo automático con pantalla apagada", Ethernet, otras apps cerradas.
- playit.gg (lo configura el usuario): túnel TCP → 127.0.0.1:25565 y UDP → 127.0.0.1:24454; `voice_host` en
  `config/voicechat/voicechat-server.properties` [VERIFICAR formato]. Ya existe `/Volumes/Z Slim/playit-agent/`.
- Backups: Simple Backups cada 30–60 min (~20 copias) + `scripts/backup.sh` antes de cada sesión y de cada cambio de mods.

## 5. Flujo de distribución
`pack/mods/` es la fuente de verdad de los mods de cliente. `scripts/build-mrpack.py <ver>` genera `dist/*.mrpack` y `dist/*-mods.zip`.
`scripts/sync-mods.sh` copia a `server/mods/` excluyendo `client-only.txt` y agregando `pack/server-only/`.
Configs/kubejs que necesiten los clientes → `pack/overrides/` (se incluyen en el .mrpack). Cada cambio → nueva versión.

## 6. Fases
1. Preparar la Mac ✅ · 2. Forge vanilla ✅ · 3. Mods ✅ (falta probar el .mrpack en un cliente) · 4. Ciclo muerte/revivir (en `world_test`) ·
5. Scripts y configs de dificultad (proponer valores al usuario antes de aplicar) · 6. Quests · 7. Mundo real (`level-name=world`, Chunky 4000/1500),
Simple Backups, playit.gg, voz, whitelist · 8. Distribución + instrucciones.

## 7. Riesgos
Reviver Mod pequeño (MCreator) → Fase 4 obligatoria. Improved Mobs + Champions + In Control se multiplican → empezar moderado.
Mods de cliente en el server → crash; mantener `client-only.txt`. Nunca actualizar mods sin backup. exFAT → archivos `._*` (ver CHANGELOG).
