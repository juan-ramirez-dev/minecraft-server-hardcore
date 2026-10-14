// Cofre del Alma: revivir temprano sin hacer toda la progresión.
// - Si hay jugadores muertos (espectadores), entre 20 y 40 min después aparece un cofre con un Reviver (Reviver Mod),
//   preferentemente dentro de una Ciudad Antigua (guarida del Warden) lejos de los vivos. Dura 45 min.
// - Las coordenadas salen en el chat y en una bossbar con cuenta regresiva.
// - Uso (lo maneja Reviver Mod): renombrar el Reviver en un yunque con el nombre exacto del muerto y clic derecho
//   (o ponerlo en el Reviver Altar con redstone). Los Corazones del Alma que ya existan siguen funcionando.
// - Además, cada 2–3 h de juego (con alguien vivo conectado) aparece un Cofre del Alma "de reserva" aunque nadie haya muerto,
//   dentro de una estructura peligrosa y, si tiene, junto a un spawner. Su Reviver se puede guardar para la próxima muerte.
// Admin: /alma forzar | /alma reserva | /alma estado | /alma cancelar | /alma dar <jugador>
// Nota Rhino: dentro de funciones se usa `var`.

const $AlmaRegistries = Java.loadClass('net.minecraft.core.registries.Registries')
const $AlmaResourceKey = Java.loadClass('net.minecraft.resources.ResourceKey')
const $AlmaRL = Java.loadClass('net.minecraft.resources.ResourceLocation')
const $AlmaHolderSet = Java.loadClass('net.minecraft.core.HolderSet')
const $AlmaList = Java.loadClass('java.util.List')
const $AlmaBlockPos = Java.loadClass('net.minecraft.core.BlockPos')

const ALMA_DELAY_MIN = 20 * 60 * 20
const ALMA_DELAY_MAX = 40 * 60 * 20
const ALMA_DURATION = 45 * 60 * 20
const ALMA_RETRY = 60 * 60 * 20
const ALMA_FREE_MIN = 2 * 60 * 60 * 20   // cofre de reserva: cada 2–3 h de juego
const ALMA_FREE_MAX = 3 * 60 * 60 * 20
// Estructuras peligrosas del Overworld (muchos mobs o spawners) donde puede aparecer el cofre de reserva
const ALMA_HARD = {
  'betterdungeons:skeleton_dungeon': 'una mazmorra de esqueletos', 'betterdungeons:zombie_dungeon': 'una mazmorra de zombis',
  'betterdungeons:spider_dungeon': 'una mazmorra de arañas', 'betterstrongholds:stronghold': 'una fortaleza del End',
  'minecraft:mansion': 'una mansión del bosque', 'nova_structures:undead_crypt': 'una cripta de no-muertos',
  'nova_structures:creeping_crypt': 'una cripta rastrera', 'nova_structures:illager_manor': 'una mansión illager',
  'nova_structures:illager_hideout': 'un escondite illager', 'nova_structures:donjon': 'un torreón',
  'nova_structures:stray_fort': 'un fuerte de esqueletos glaciales', 'nova_structures:bunker': 'un búnker',
  'born_in_chaos_v1:dark_tower_forest': 'una torre oscura', 'born_in_chaos_v1:dark_tower_plain': 'una torre oscura',
  'born_in_chaos_v1:dark_tower_taiga': 'una torre oscura', 'explorify:mausoleum': 'un mausoleo',
  'explorify:black_spiral': 'la espiral negra', 'mowziesmobs:wrought_chamber': 'la cámara del Wroughtnaut',
  'cataclysm:frosted_prison': 'la prisión helada (Maledictus)', 'cataclysm:cursed_pyramid': 'la pirámide maldita',
  'cataclysm:ancient_factory': 'la fábrica antigua (Harbinger)'
}
const ALMA_BAR = 'alma:cofre'
const ALMA_NAME = 'Corazón del Alma'
// Reviver del cofre: marca SoulChest para saber cuándo lo sacan (no afecta a renombrarlo ni a usarlo)
const ALMA_REVIVER_NBT = '{SoulChest:1b}'
const ALMA_ITEM_NBT = '{SoulHeart:1b,display:{Name:\'{"text":"Corazón del Alma","color":"light_purple","italic":false}\',' +
  'Lore:[\'{"text":"Renómbralo en un yunque con el","color":"gray","italic":false}\',' +
  '\'{"text":"nombre exacto del jugador muerto","color":"gray","italic":false}\',' +
  '\'{"text":"y haz clic derecho para revivirlo.","color":"gray","italic":false}\']},' +
  'Enchantments:[{id:"minecraft:unbreaking",lvl:1s}],HideFlags:1}'

function almaCmd(server, c) { server.runCommandSilent(c) }
function almaNow(server) { return Number(server.overworld().getLevelData().getGameTime()) }
function almaTell(server, who, parts) { almaCmd(server, `tellraw ${who} ${JSON.stringify([{ text: '[Alma] ', color: 'light_purple', bold: true }].concat(parts))}`) }

function almaState(server) {
  var s = String(server.persistentData.getString('alma'))
  var st = s ? JSON.parse(s) : {}
  if (!st.dead) st.dead = []
  if (!st.next) st.next = 0
  if (!st.active) st.active = false
  return st
}
function almaSave(server, st) { server.persistentData.putString('alma', JSON.stringify(st)) }

function almaIsChestReviver(item) {
  if (!item || String(item.id) != 'revivermod:reviver') return false
  var nbt = item.nbt
  return nbt != null && nbt.getBoolean('SoulChest')
}

function almaIsSoulHeart(item) {
  if (!item || String(item.id) != 'minecraft:heart_of_the_sea') return false
  var nbt = item.nbt
  return nbt != null && nbt.getBoolean('SoulHeart')
}

function almaRand(a, b) { return a + Math.floor(Math.random() * (b - a)) }

// Centro de los jugadores vivos en el Overworld (o el spawn si no hay)
function almaCenter(server) {
  var xs = 0, zs = 0, n = 0
  server.players.forEach(p => {
    if (p.isSpectator() || String(p.level.dimension) != 'minecraft:overworld') return
    xs += Number(p.x); zs += Number(p.z); n++
  })
  if (n) return [xs / n, zs / n]
  var sp = server.overworld().getSharedSpawnPos()
  return [Number(sp.x), Number(sp.z)]
}

function almaFindAncientCity(level, x, z) {
  try {
    var reg = level.registryAccess().registryOrThrow($AlmaRegistries.STRUCTURE)
    var holder = reg.getHolderOrThrow($AlmaResourceKey.create($AlmaRegistries.STRUCTURE, new $AlmaRL('minecraft:ancient_city')))
    var set = $AlmaHolderSet.direct($AlmaList.of(holder))
    var pair = level.getChunkSource().getGenerator().findNearestMapStructure(level, set, new $AlmaBlockPos(Math.floor(x), 0, Math.floor(z)), 64, false)
    if (!pair) return null
    var pos = pair.getFirst()
    return [Number(pos.x), Number(pos.z)]
  } catch (err) {
    console.error('Cofre del Alma: no se pudo buscar la Ciudad Antigua (' + x + ', ' + z + '): ' + err)
    return null
  }
}

function almaFloorSpot(level, cx, cz, yMin, yMax, radius) {
  for (var r = 0; r <= radius; r += 3) {
    for (var t = 0; t < 12; t++) {
      var a = Math.random() * 6.283185307179586
      var x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r)
      for (var y = yMin; y <= yMax; y++) {
        var b0 = String(level.getBlock(x, y, z).id), b1 = String(level.getBlock(x, y + 1, z).id), bd = String(level.getBlock(x, y - 1, z).id)
        if (b0.endsWith('air') && b1.endsWith('air') && !bd.endsWith('air') && bd != 'minecraft:water' && bd != 'minecraft:lava' && bd != 'minecraft:sculk_sensor' && bd != 'minecraft:sculk_shrieker')
          return [x, y, z]
      }
    }
  }
  return null
}

// Estructura peligrosa cercana a (x, z): devuelve { box, spawners, name } o null
function almaFindHardStructure(level, x, z, forcedId) {
  var ids = Object.keys(ALMA_HARD)
  var id = forcedId || ids[Math.floor(Math.random() * ids.length)]
  try {
    var reg = level.registryAccess().registryOrThrow($AlmaRegistries.STRUCTURE)
    var holder = reg.getHolderOrThrow($AlmaResourceKey.create($AlmaRegistries.STRUCTURE, new $AlmaRL(id)))
    var pair = level.getChunkSource().getGenerator().findNearestMapStructure(level, $AlmaHolderSet.direct($AlmaList.of(holder)), new $AlmaBlockPos(Math.floor(x), 0, Math.floor(z)), 50, false)
    if (!pair) return null
    var pos = pair.getFirst()
    var start = level.getChunk(pos.x >> 4, pos.z >> 4).getStartForStructure(holder.value())
    if (!start || !start.isValid()) return null
    var box = start.getBoundingBox()
    var b = { minX: box.minX(), minY: box.minY(), minZ: box.minZ(), maxX: box.maxX(), maxY: box.maxY(), maxZ: box.maxZ() }
    // spawners dentro de la estructura (máx. 81 chunks)
    var spawners = []
    var c0x = b.minX >> 4, c1x = b.maxX >> 4, c0z = b.minZ >> 4, c1z = b.maxZ >> 4
    if ((c1x - c0x + 1) * (c1z - c0z + 1) <= 81) {
      for (var cx = c0x; cx <= c1x; cx++) for (var cz = c0z; cz <= c1z; cz++) {
        var it = level.getChunk(cx, cz).getBlockEntities().values().iterator()
        while (it.hasNext()) {
          var bp = it.next().getBlockPos()
          if (String(level.getBlock(bp).id) == 'minecraft:spawner') {
            if (bp.x >= b.minX && bp.x <= b.maxX && bp.z >= b.minZ && bp.z <= b.maxZ) spawners.push([bp.x, bp.y, bp.z])
          }
        }
      }
    }
    return { box: b, spawners: spawners, name: ALMA_HARD[id] || id, id: id }
  } catch (err) {
    console.error('Cofre del Alma: no se pudo buscar ' + id + ' (' + x + ', ' + z + '): ' + err)
    return null
  }
}

// Sitio para el cofre dentro de una estructura: junto a un spawner si hay, si no en su interior
function almaHardSpot(level, s) {
  for (var i = 0; i < s.spawners.length && i < 6; i++) {
    var sp = s.spawners[Math.floor(Math.random() * s.spawners.length)]
    var spot = almaFloorSpot(level, sp[0], sp[2], sp[1] - 2, sp[1] + 2, 6)
    if (spot) return spot
  }
  var b = s.box
  return almaFloorSpot(level, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, b.minY + 1, b.maxY - 1, Math.min(24, Math.max(6, (b.maxX - b.minX) / 2)))
}

// Plan B: cámara profunda con spawners en un punto lejano
function almaBuildVault(server, x, z) {
  var y = -40
  var d = 'execute in minecraft:overworld run '
  almaCmd(server, `${d}fill ${x - 3} ${y - 1} ${z - 3} ${x + 3} ${y + 4} ${z + 3} minecraft:deepslate_bricks hollow`)
  almaCmd(server, `${d}setblock ${x - 2} ${y} ${z - 2} minecraft:spawner{SpawnData:{entity:{id:"minecraft:zombie"}},Delay:20s,SpawnCount:2s,RequiredPlayerRange:24s}`)
  almaCmd(server, `${d}setblock ${x + 2} ${y} ${z + 2} minecraft:spawner{SpawnData:{entity:{id:"minecraft:skeleton"}},Delay:20s,SpawnCount:2s,RequiredPlayerRange:24s}`)
  almaCmd(server, `${d}setblock ${x - 2} ${y} ${z + 2} minecraft:spawner{SpawnData:{entity:{id:"minecraft:spider"}},Delay:20s,SpawnCount:2s,RequiredPlayerRange:24s}`)
  almaCmd(server, `${d}setblock ${x + 2} ${y} ${z - 2} minecraft:spawner{SpawnData:{entity:{id:"minecraft:cave_spider"}},Delay:20s,SpawnCount:3s,RequiredPlayerRange:24s}`)
  almaCmd(server, `${d}setblock ${x} ${y + 3} ${z} minecraft:soul_lantern[hanging=true]`)
  return [x, y, z]
}

// Lo reutiliza supply_chest.js
global.almaEstructuras = ALMA_HARD
global.almaCenter = almaCenter
global.almaFindStructure = almaFindHardStructure
global.almaHardSpot = almaHardSpot
global.almaBuildVault = almaBuildVault

function almaSpawnChest(server, reserva) {
  var level = server.overworld()
  var c = almaCenter(server)
  var spot = null, where = '', zona = null   // zona = centro de la estructura (lo que se anuncia, no el cofre)
  for (var j = 0; reserva && j < 6 && !spot; j++) {
    var a0 = Math.random() * 6.283185307179586, d0 = almaRand(600, 1800)
    var hs = almaFindHardStructure(level, c[0] + Math.cos(a0) * d0, c[1] + Math.sin(a0) * d0)
    if (!hs) continue
    var hx = (hs.box.minX + hs.box.maxX) / 2, hz = (hs.box.minZ + hs.box.maxZ) / 2
    var hd = Math.sqrt(Math.pow(hx - c[0], 2) + Math.pow(hz - c[1], 2))
    if (hd < 400 || hd > 2500) continue
    spot = almaHardSpot(level, hs)
    if (spot) { where = 'en ' + hs.name + (hs.spawners.length ? ` (${hs.spawners.length} spawners)` : ''); zona = [Math.round(hx), Math.round(hz)] }
  }
  for (var i = 0; !reserva && i < 4 && !spot; i++) {
    var a = Math.random() * 6.283185307179586, d = almaRand(800, 1600)
    var city = almaFindAncientCity(level, c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d)
    if (!city) continue
    var dist = Math.sqrt(Math.pow(city[0] - c[0], 2) + Math.pow(city[1] - c[1], 2))
    if (dist < 500 || dist > 3000) continue
    spot = almaFloorSpot(level, city[0], city[1], -51, -20, 30)
    if (spot) { where = 'en una Ciudad Antigua (guarida del Warden)'; zona = [city[0], city[1]] }
  }
  if (!spot) {
    var a2 = Math.random() * 6.283185307179586, d2 = almaRand(700, 1200)
    spot = almaBuildVault(server, Math.floor(c[0] + Math.cos(a2) * d2), Math.floor(c[1] + Math.sin(a2) * d2))
    where = 'en una cámara profunda custodiada'
  }
  if (!zona) zona = [spot[0], spot[2]]
  // getBlock ya cargó el chunk: el setblock funciona
  level.getBlock(spot[0], spot[1], spot[2]).set('minecraft:air')
  almaCmd(server, `execute in minecraft:overworld run setblock ${spot[0]} ${spot[1]} ${spot[2]} minecraft:chest{CustomName:'{"text":"Cofre del Alma","color":"light_purple"}',Items:[{Slot:13b,id:"revivermod:reviver",Count:1b,tag:${ALMA_REVIVER_NBT}}]}`)

  var st = almaState(server)
  var now = almaNow(server)
  st.active = true
  st.pos = spot
  st.zona = zona
  st.end = now + ALMA_DURATION
  st.where = where
  st.reserva = !!reserva
  almaSave(server, st)

  almaCmd(server, `bossbar remove ${ALMA_BAR}`)
  almaCmd(server, `bossbar add ${ALMA_BAR} ""`)
  almaCmd(server, `bossbar set ${ALMA_BAR} color pink`)
  almaCmd(server, `bossbar set ${ALMA_BAR} max ${ALMA_DURATION / 20}`)
  almaCmd(server, `bossbar set ${ALMA_BAR} players @a`)
  almaBarUpdate(server, st)
  almaCmd(server, 'title @a times 10 80 20')
  almaCmd(server, `title @a subtitle ${JSON.stringify({ text: `Zona X ${zona[0]}  Z ${zona[1]}`, color: 'white' })}`)
  almaCmd(server, `title @a title ${JSON.stringify({ text: 'Cofre del Alma', color: 'light_purple', bold: true })}`)
  almaCmd(server, 'execute as @a at @s run playsound minecraft:block.respawn_anchor.charge master @s ~ ~ ~ 1 0.6')
  almaTell(server, '@a', [
    { text: 'Apareció un Cofre del Alma ' + where + '. Zona: ', color: 'white' },
    { text: `X ${zona[0]}  Z ${zona[1]}`, color: 'gold', bold: true },
    { text: ` (Overworld) — el cofre está escondido por ahí, hay que buscarlo. Desaparece en ${ALMA_DURATION / 1200} min. ` + (reserva
      ? 'Nadie ha muerto: su Reviver se puede guardar para la próxima muerte.'
      : 'Dentro hay un Reviver: renómbralo en un yunque con el nombre del muerto y haz clic derecho.'), color: 'white' }
  ])
}

function almaBarUpdate(server, st) {
  var left = Math.max(0, Math.ceil((st.end - almaNow(server)) / 20))
  var mm = Math.floor(left / 60), ss = left % 60
  almaCmd(server, `bossbar set ${ALMA_BAR} value ${left}`)
  almaCmd(server, `bossbar set ${ALMA_BAR} name ${JSON.stringify([{ text: '✦ Cofre del Alma ', color: 'light_purple', bold: true }, { text: `zona ${(st.zona || [st.pos[0], st.pos[2]]).join(' ')} — ${mm}:${ss < 10 ? '0' : ''}${ss}`, color: 'white' }])}`)
}

function almaRemoveChest(server, st) {
  var level = server.overworld()
  var b = level.getBlock(st.pos[0], st.pos[1], st.pos[2])
  if (String(b.id) == 'minecraft:chest') {
    var be = b.entity
    if (be) be.clearContent()
    b.set('minecraft:air')
  }
}

function almaFinish(server, st, reason) {
  almaCmd(server, `bossbar remove ${ALMA_BAR}`)
  st.active = false
  st.next = st.dead.length ? almaNow(server) + ALMA_RETRY : 0
  almaSave(server, st)
  if (reason == 'expired') {
    almaRemoveChest(server, st)
    almaTell(server, '@a', [{ text: 'El Cofre del Alma se desvaneció.', color: 'gray' }])
  }
}

// Muerte de un jugador → queda en la lista de muertos y se programa un cofre
EntityEvents.death(e => {
  if (!e.entity.player) return
  var server = e.server
  if (global.gulagMuerte && global.gulagMuerte(server, e.entity)) return  // murió en el gulag (gulag.js)
  if (global.vidasMuerte && !global.vidasMuerte(server, e.entity)) return  // le quedan vidas (lives.js)
  var st = almaState(server)
  var name = String(e.entity.username)
  if (st.dead.indexOf(name) < 0) st.dead.push(name)
  if (!st.active && !st.next) st.next = almaNow(server) + almaRand(ALMA_DELAY_MIN, ALMA_DELAY_MAX)
  almaSave(server, st)
})

let almaTicker = 0
ServerEvents.tick(e => {
  if (++almaTicker % 20 != 0) return
  var server = e.server
  var st = almaState(server)
  var changed = false
  // Quien ya está vivo (revivido por cualquier medio) sale de la lista
  server.players.forEach(p => {
    var i = st.dead.indexOf(String(p.username))
    if (i >= 0 && !p.isSpectator()) { st.dead.splice(i, 1); changed = true }
  })
  if (!st.dead.length && !st.active && st.next) { st.next = 0; changed = true }
  if (changed) almaSave(server, st)

  var now = almaNow(server)
  if (st.active) {
    if (now >= st.end) { almaFinish(server, st, 'expired'); return }
    almaBarUpdate(server, st)
    return
  }
  var alive = 0
  server.players.forEach(p => { if (!p.isSpectator()) alive++ })
  if (st.dead.length && st.next && now >= st.next && alive > 0) { almaSpawnChest(server, false); return }
  // Cofre de reserva: cuenta solo el tiempo con alguien vivo conectado
  if (alive > 0) {
    st.play = (st.play || 0) + 20
    if (!st.nextFree) st.nextFree = st.play + almaRand(ALMA_FREE_MIN, ALMA_FREE_MAX)
    if (st.play >= st.nextFree) {
      st.nextFree = st.play + almaRand(ALMA_FREE_MIN, ALMA_FREE_MAX)
      almaSave(server, st)
      almaSpawnChest(server, true)
      return
    }
    almaSave(server, st)
  }
})

// Alguien sacó el Reviver del cofre → se anuncia y termina la cuenta regresiva
PlayerEvents.inventoryChanged(e => {
  var chestReviver = almaIsChestReviver(e.item)
  if (!chestReviver && !almaIsSoulHeart(e.item)) return
  if (chestReviver) e.item.removeTagKey('SoulChest')   // ya salió del cofre: vuelve a ser un Reviver normal
  var server = e.server
  var st = almaState(server)
  if (!st.active) return
  almaTell(server, '@a', [{ text: `${e.player.username} tomó el Reviver del Cofre del Alma.`, color: 'light_purple' }])
  almaCmd(server, 'execute as @a at @s run playsound minecraft:item.totem.use master @s ~ ~ ~ 0.6 1.2')
  almaFinish(server, st, 'taken')
})

// Usar el Corazón renombrado → revive al muerto a tu lado
ItemEvents.rightClicked(e => {
  if (!almaIsSoulHeart(e.item)) return
  almaUseHeart(e)
  e.cancel()   // en KubeJS 6 cancel() termina el handler: va al final
})

function almaUseHeart(e) {
  if (String(e.hand) != 'MAIN_HAND') return
  var server = e.server, p = e.player
  var target = String(e.item.hoverName.string).trim()
  if (target == ALMA_NAME) {
    almaTell(server, p.username, [{ text: 'Primero renómbralo en un yunque con el nombre exacto del jugador muerto.', color: 'yellow' }])
    return
  }
  var dead = server.playerList.getPlayerByName(target)
  if (!dead) { almaTell(server, p.username, [{ text: `${target} no está conectado. Tiene que estar en línea para revivirlo.`, color: 'red' }]); return }
  if (!dead.isSpectator()) { almaTell(server, p.username, [{ text: `${target} no está muerto.`, color: 'red' }]); return }
  if (String(dead.username) == String(p.username)) return

  e.item.shrink(1)
  var dim = String(p.level.dimension)
  almaCmd(server, `execute in ${dim} run tp ${target} ${p.x} ${p.y} ${p.z}`)
  almaCmd(server, `gamemode survival ${target}`)
  dead.setHealth(10)
  almaCmd(server, `effect give ${target} minecraft:weakness 300 0`)
  almaCmd(server, `effect give ${target} minecraft:slowness 300 0`)
  almaCmd(server, `effect give ${target} minecraft:hunger 120 0`)
  almaCmd(server, `execute in ${dim} run particle minecraft:totem_of_undying ${p.x} ${p.y + 1} ${p.z} 0.5 1 0.5 0.4 120`)
  almaCmd(server, 'execute as @a at @s run playsound minecraft:item.totem.use master @s ~ ~ ~ 1 0.8')
  almaTell(server, '@a', [{ text: `${p.username} revivió a ${target} con el Corazón del Alma.`, color: 'light_purple', bold: true }])
  var st = almaState(server)
  var i = st.dead.indexOf(target)
  if (i >= 0) { st.dead.splice(i, 1); almaSave(server, st) }
}

PlayerEvents.loggedIn(e => {
  var st = almaState(e.server)
  if (st.active) almaCmd(e.server, `bossbar set ${ALMA_BAR} players @a`)
})

ServerEvents.commandRegistry(event => {
  var Commands = event.commands, Arguments = event.arguments
  event.register(Commands.literal('alma').requires(s => s.hasPermission(2))
    .then(Commands.literal('forzar').executes(ctx => { almaSpawnChest(ctx.source.server, false); return 1 }))
    .then(Commands.literal('reserva').executes(ctx => { almaSpawnChest(ctx.source.server, true); return 1 }))
    .then(Commands.literal('cancelar').executes(ctx => {
      var st = almaState(ctx.source.server)
      if (st.active) almaFinish(ctx.source.server, st, 'expired')
      return 1
    }))
    .then(Commands.literal('dar').then(Commands.argument('jugador', Arguments.PLAYER.create(event)).executes(ctx => {
      var p = Arguments.PLAYER.getResult(ctx, 'jugador')
      almaCmd(ctx.source.server, `give ${p.username} revivermod:reviver${ALMA_REVIVER_NBT} 1`)
      return 1
    })))
    .then(Commands.literal('estado').executes(ctx => {
      var server = ctx.source.server, st = almaState(server), now = almaNow(server)
      ctx.source.sendSystemMessage(Text.yellow(`Muertos: ${st.dead.join(', ') || '-'} | cofre activo: ${st.active ? st.pos.join(' ') + ' ' + (st.where || '') + (st.reserva ? ' [reserva]' : '') + ' (' + Math.ceil((st.end - now) / 20) + ' s)' : 'no'} | próximo: ${st.next ? Math.max(0, Math.ceil((st.next - now) / 20)) + ' s' : '-'} | reserva en: ${st.nextFree ? Math.max(0, Math.ceil((st.nextFree - (st.play || 0)) / 1200)) + ' min de juego' : '-'}`))
      return 1
    })))
})
