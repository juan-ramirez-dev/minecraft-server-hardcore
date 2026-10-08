// Eventos del Caos: de vez en cuando el mundo se pone más difícil por un rato y luego vuelve a la normalidad.
// - Aleatorios: cada ~20 min de juego (con jugadores vivos conectados) hay probabilidad de que empiece uno.
// - Furia de la Luna: fija, cada 2 lunas llenas, dura toda la noche.
// - Nunca afectan la zona segura del spawn/casino.
// Admin: /caos iniciar <evento> | /caos parar | /caos estado | /caos activar | /caos desactivar
// Nota Rhino: dentro de funciones se usa `var` (let/const no se reinicializan bien dentro de bucles).

const $CaosAttrMod = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
const $CaosAttrOp = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation')
const $CaosAttributes = Java.loadClass('net.minecraft.world.entity.ai.attributes.Attributes')
const $CaosUUID = Java.loadClass('java.util.UUID')
const $CaosSlot = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
const $CaosHeightmap = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types')

const CAOS_CHECK_EVERY = 20 * 60 * 20   // cada 20 min se tira el dado
const CAOS_CHANCE = 0.35                // probabilidad de que empiece un evento en cada tirada
const CAOS_COOLDOWN = 15 * 60 * 20      // mínimo entre el fin de un evento y la próxima tirada
const CAOS_BAR = 'caos:evento'
const CAOS_FOLLOW_ID = $CaosUUID.fromString('6f1d6b8e-3c1a-4d0e-9b8a-0c0a05000001')
const CAOS_PHANTOM_SPEED_ID = $CaosUUID.fromString('6f1d6b8e-3c1a-4d0e-9b8a-0c0a05000002')

function caosCmd(server, c) { server.runCommandSilent(c) }
function caosNow(server) { return Number(server.overworld().getLevelData().getGameTime()) }
function caosDayTime(server) { return Number(server.overworld().getDayTime()) }
function caosIsNight(server) { var t = caosDayTime(server) % 24000; return t >= 13000 && t < 23000 }
function caosRnd(n) { return Math.floor(Math.random() * n) }

function caosState(server) {
  var s = String(server.persistentData.getString('caos'))
  var st = s ? JSON.parse(s) : {}
  if (st.enabled === undefined) st.enabled = true
  if (!st.active) st.active = ''
  if (!st.next) st.next = caosNow(server) + CAOS_CHECK_EVERY
  if (!st.furiaDay) st.furiaDay = -1
  return st
}
function caosSave(server, st) { server.persistentData.putString('caos', JSON.stringify(st)) }

function caosHasTag(e, t) { return e.getTags().contains(t) }
function caosIsHostile(e) { return e.monster && !e.player }
function caosInSafe(e) { return global.inHub(e.level, e.x, e.z) }

// Jugadores vivos (no espectadores, no creativo) fuera de la zona segura
function caosTargets(server) {
  var out = []
  server.players.forEach(p => {
    if (p.isSpectator() || p.isCreative()) return
    if (global.inHub(p.level, p.x, p.z)) return
    out.push(p)
  })
  return out
}
function caosAliveCount(server) {
  var n = 0
  server.players.forEach(p => { if (!p.isSpectator()) n++ })
  return n
}

// Busca un punto donde aparecer un mob cerca de un jugador (aire x2 sobre suelo sólido)
function caosSpot(p, minR, maxR, surface) {
  var level = p.level
  for (var t = 0; t < 14; t++) {
    var a = Math.random() * 6.283185307179586
    var r = minR + Math.random() * (maxR - minR)
    var x = Math.floor(p.x + Math.cos(a) * r)
    var z = Math.floor(p.z + Math.sin(a) * r)
    if (global.inHub(level, x, z)) continue
    if (surface) {
      var y0 = level.getHeight($CaosHeightmap.MOTION_BLOCKING_NO_LEAVES, x, z)
      return [x, y0 + (surface === 'air' ? 18 : 0), z]
    }
    for (var dy = 4; dy >= -4; dy--) {
      var y = Math.floor(p.y) + dy
      var b0 = String(level.getBlock(x, y, z).id), b1 = String(level.getBlock(x, y + 1, z).id), bd = String(level.getBlock(x, y - 1, z).id)
      if (b0.endsWith('air') && b1.endsWith('air') && !bd.endsWith('air') && bd != 'minecraft:water' && bd != 'minecraft:lava') return [x, y, z]
    }
  }
  return null
}

function caosSummon(server, p, type, spot) {
  caosCmd(server, `execute in ${String(p.level.dimension)} run summon ${type} ${spot[0] + 0.5} ${spot[1]} ${spot[2] + 0.5}`)
}

// --- Definición de eventos ---
// onMob(mob, server, st): se aplica a cada hostil (existente al empezar y nuevo mientras dure)
// pulse(server, st): se llama cada `every` ticks
const CAOS_EVENTS = {
  tormenta: {
    name: 'Tormenta Eléctrica', desc: 'Todos los creepers están cargados', color: 'yellow', weight: 3, dur: 10 * 60 * 20,
    start: (server, st) => caosCmd(server, `weather thunder ${Math.ceil(st.dur / 20) + 30}`),
    onMob: (m) => { if (String(m.type) == 'minecraft:creeper') { m.mergeNbt({ powered: true }); m.addTag('caos_tormenta') } },
    end: (server) => {
      caosCmd(server, 'weather clear')
      caosEachHostile(server, m => { if (caosHasTag(m, 'caos_tormenta')) { m.mergeNbt({ powered: false }); m.removeTag('caos_tormenta') } })
    }
  },
  caceria: {
    name: 'La Cacería', desc: 'Los monstruos te huelen desde el doble de distancia', color: 'red', weight: 3, dur: 10 * 60 * 20,
    onMob: (m) => {
      var inst = m.getAttribute($CaosAttributes.FOLLOW_RANGE)
      if (inst && !inst.hasModifier(new $CaosAttrMod(CAOS_FOLLOW_ID, 'caos_caceria', 1.0, $CaosAttrOp.MULTIPLY_BASE)))
        inst.addTransientModifier(new $CaosAttrMod(CAOS_FOLLOW_ID, 'caos_caceria', 1.0, $CaosAttrOp.MULTIPLY_BASE))
    },
    end: (server) => caosEachHostile(server, m => { var inst = m.getAttribute($CaosAttributes.FOLLOW_RANGE); if (inst) inst.removeModifier(CAOS_FOLLOW_ID) })
  },
  plaga: {
    name: 'Plaga de Arañas', desc: 'Arañas por todas partes, y envenenan', color: 'dark_green', weight: 2, dur: 8 * 60 * 20, every: 300,
    onMob: (m) => { var t = String(m.type); if (t == 'minecraft:spider' || t == 'minecraft:cave_spider') m.addTag('caos_plaga') },
    pulse: (server) => caosTargets(server).forEach(p => {
      if (String(p.level.dimension) != 'minecraft:overworld') return
      var n = 1 + caosRnd(2)
      for (var i = 0; i < n; i++) { var s = caosSpot(p, 10, 22, false); if (s) caosSummon(server, p, Math.random() < 0.35 ? 'minecraft:cave_spider' : 'minecraft:spider', s) }
    })
  },
  asedio: {
    name: 'Asedio', desc: 'Oleadas de monstruos te buscan', color: 'dark_red', weight: 2, dur: 6 * 60 * 20, every: 900,
    pulse: (server) => caosTargets(server).forEach(p => {
      if (String(p.level.dimension) != 'minecraft:overworld') return
      var pool = ['minecraft:zombie', 'minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider', 'minecraft:creeper', 'minecraft:husk']
      var n = 2 + caosRnd(3)
      for (var i = 0; i < n; i++) { var s = caosSpot(p, 12, 24, false); if (s) caosSummon(server, p, pool[caosRnd(pool.length)], s) }
      caosCmd(server, `execute as ${p.username} at @s run playsound minecraft:event.raid.horn hostile @s ~ ~ ~ 0.6 1`)
    })
  },
  cielo: {
    name: 'Cielo Hostil', desc: 'Los phantoms cazan esta noche', color: 'dark_purple', weight: 2, dur: 10 * 60 * 20, every: 600, nightOnly: true,
    onMob: (m) => {
      if (String(m.type) != 'minecraft:phantom') return
      var inst = m.getAttribute($CaosAttributes.FLYING_SPEED)
      m.addTag('caos_cielo')
    },
    pulse: (server) => caosTargets(server).forEach(p => {
      if (String(p.level.dimension) != 'minecraft:overworld') return
      var top = p.level.getHeight($CaosHeightmap.MOTION_BLOCKING_NO_LEAVES, Math.floor(p.x), Math.floor(p.z))
      if (p.y < top - 2) return   // bajo techo o en cuevas no hay phantoms
      var n = 1 + caosRnd(2)
      for (var i = 0; i < n; i++) caosCmd(server, `execute in minecraft:overworld run summon minecraft:phantom ${p.x + caosRnd(16) - 8} ${p.y + 20} ${p.z + caosRnd(16) - 8} {Size:2}`)
    })
  },
  francotiradores: {
    name: 'Francotiradores', desc: 'Los esqueletos llevan arcos de Poder', color: 'gray', weight: 2, dur: 10 * 60 * 20,
    onMob: (m) => {
      var t = String(m.type)
      if (t != 'minecraft:skeleton' && t != 'minecraft:stray') return
      m.setItemSlot($CaosSlot.MAINHAND, Item.of('minecraft:bow', '{Enchantments:[{id:"minecraft:power",lvl:3s},{id:"minecraft:punch",lvl:1s}]}'))
      m.setDropChance($CaosSlot.MAINHAND, 0)
      m.addTag('caos_franco')
    },
    end: (server) => caosEachHostile(server, m => {
      if (!caosHasTag(m, 'caos_franco')) return
      m.setItemSlot($CaosSlot.MAINHAND, Item.of('minecraft:bow'))
      m.setDropChance($CaosSlot.MAINHAND, 0.085)
      m.removeTag('caos_franco')
    })
  },
  furia: {
    name: 'Furia de la Luna', desc: 'Luna llena: los monstruos son más fuertes y rápidos', color: 'gold', weight: 0, dur: 10000, fixed: true,
    onMob: (m, server, st) => {
      var left = Math.max(20, st.end - caosNow(server))
      m.potionEffects.add('minecraft:strength', left, 1, false, true)
      m.potionEffects.add('minecraft:speed', left, 0, false, true)
    }
  }
}

function caosEachHostile(server, fn) {
  server.getAllLevels().forEach(level => {
    level.getEntities().forEach(e => { if (caosIsHostile(e)) fn(e) })
  })
}

function caosApplyAll(server, st) {
  var ev = CAOS_EVENTS[st.active]
  if (!ev || !ev.onMob) return
  var tag = 'caos_seen_' + st.active + '_' + st.start
  caosEachHostile(server, m => {
    if (caosInSafe(m) || caosHasTag(m, tag)) return
    m.addTag(tag)
    ev.onMob(m, server, st)
  })
}

function caosBar(server, st) {
  var ev = CAOS_EVENTS[st.active]
  var left = Math.max(0, Math.ceil((st.end - caosNow(server)) / 20))
  caosCmd(server, `bossbar set ${CAOS_BAR} value ${left}`)
  var mm = Math.floor(left / 60), ss = left % 60
  caosCmd(server, `bossbar set ${CAOS_BAR} name ${JSON.stringify([{ text: '☠ ' + ev.name + ' ', color: ev.color, bold: true }, { text: `${mm}:${ss < 10 ? '0' : ''}${ss}`, color: 'white' }])}`)
}

function caosStart(server, id, durOverride) {
  var st = caosState(server)
  if (st.active) caosEnd(server, true)
  st = caosState(server)
  var ev = CAOS_EVENTS[id]
  var now = caosNow(server)
  st.active = id
  st.start = now
  st.dur = durOverride || ev.dur
  if (ev.nightOnly) st.dur = Math.min(st.dur, 23000 - (caosDayTime(server) % 24000))
  st.end = now + st.dur
  st.lastPulse = now
  caosSave(server, st)
  caosCmd(server, `bossbar remove ${CAOS_BAR}`)
  caosCmd(server, `bossbar add ${CAOS_BAR} ""`)
  caosCmd(server, `bossbar set ${CAOS_BAR} max ${Math.ceil(st.dur / 20)}`)
  caosCmd(server, `bossbar set ${CAOS_BAR} color ${ev.color == 'yellow' || ev.color == 'gold' ? 'yellow' : ev.color == 'dark_green' ? 'green' : ev.color == 'dark_purple' ? 'purple' : ev.color == 'gray' ? 'white' : 'red'}`)
  caosCmd(server, `bossbar set ${CAOS_BAR} players @a`)
  caosBar(server, st)
  caosCmd(server, 'title @a times 10 70 20')
  caosCmd(server, `title @a subtitle ${JSON.stringify({ text: ev.desc, color: 'white' })}`)
  caosCmd(server, `title @a title ${JSON.stringify({ text: ev.name, color: ev.color, bold: true })}`)
  caosCmd(server, 'execute as @a at @s run playsound minecraft:event.raid.horn master @s ~ ~ ~ 1 0.7')
  caosCmd(server, `tellraw @a ${JSON.stringify([{ text: '[Caos] ', color: 'dark_red', bold: true }, { text: ev.name + ': ', color: ev.color, bold: true }, { text: ev.desc + ` (${Math.round(st.dur / 1200)} min)`, color: 'white' }])}`)
  if (ev.start) ev.start(server, st)
  caosApplyAll(server, st)
}

function caosEnd(server, silent) {
  var st = caosState(server)
  if (!st.active) return
  var ev = CAOS_EVENTS[st.active]
  if (ev && ev.end) ev.end(server, st)
  caosCmd(server, `bossbar remove ${CAOS_BAR}`)
  if (!silent && ev) {
    caosCmd(server, `tellraw @a ${JSON.stringify([{ text: '[Caos] ', color: 'dark_red', bold: true }, { text: ev.name + ' terminó. Todo vuelve a la normalidad… por ahora.', color: 'gray' }])}`)
    caosCmd(server, 'execute as @a at @s run playsound minecraft:block.beacon.deactivate master @s ~ ~ ~ 1 1')
  }
  st.active = ''
  st.next = Math.max(st.next, caosNow(server) + CAOS_COOLDOWN)
  caosSave(server, st)
}

function caosPickRandom(night) {
  var list = []
  Object.keys(CAOS_EVENTS).forEach(k => {
    var ev = CAOS_EVENTS[k]
    if (ev.fixed || (ev.nightOnly && !night)) return
    for (var i = 0; i < ev.weight; i++) list.push(k)
  })
  return list[caosRnd(list.length)]
}

// Bucle principal: una vez por segundo
let caosTicker = 0
ServerEvents.tick(e => {
  if (++caosTicker % 20 != 0) return
  var server = e.server
  var st = caosState(server)
  var now = caosNow(server)
  var dt = caosDayTime(server)
  var day = Math.floor(dt / 24000), tod = dt % 24000

  if (st.active) {
    var ev = CAOS_EVENTS[st.active]
    if (!ev || now >= st.end) { caosEnd(server, false); return }
    caosBar(server, st)
    if (caosTicker % 100 == 0) caosApplyAll(server, st)
    if (ev.pulse && now - st.lastPulse >= ev.every) { st.lastPulse = now; caosSave(server, st); ev.pulse(server, st) }
  }
  if (!st.enabled) return

  // Furia de la Luna: cada 2 lunas llenas (fase 0), toda la noche
  var fullMoon = server.overworld().getMoonPhase() == 0
  if (fullMoon && tod >= 13000 && tod < 22500 && Math.floor(day / 8) % 2 == 1 && st.furiaDay != day && st.active != 'furia') {
    st.furiaDay = day
    caosSave(server, st)
    caosStart(server, 'furia', 23000 - tod)
    return
  }

  // Tirada aleatoria
  if (!st.active && now >= st.next && caosAliveCount(server) > 0) {
    st.next = now + CAOS_CHECK_EVERY
    caosSave(server, st)
    if (Math.random() < CAOS_CHANCE) caosStart(server, caosPickRandom(tod >= 13000 && tod < 21000))
  }
})

// Mobs nuevos durante un evento
EntityEvents.spawned(e => {
  var m = e.entity
  if (!caosIsHostile(m) || caosInSafe(m)) return
  var server = e.server
  var st = caosState(server)
  if (!st.active) return
  var ev = CAOS_EVENTS[st.active]
  if (!ev || !ev.onMob) return
  var tag = 'caos_seen_' + st.active + '_' + st.start
  if (caosHasTag(m, tag)) return
  m.addTag(tag)
  ev.onMob(m, server, st)
})

// Plaga: las arañas envenenan
EntityEvents.hurt(e => {
  var src = e.source.actual
  if (src && caosHasTag(src, 'caos_plaga') && e.entity.player) e.entity.potionEffects.add('minecraft:poison', 100, 0, false, true)
})

ServerEvents.loaded(e => {
  var st = caosState(e.server)
  if (st.active) {
    if (caosNow(e.server) >= st.end) caosEnd(e.server, false)
    else caosCmd(e.server, `bossbar set ${CAOS_BAR} players @a`)
  }
})

PlayerEvents.loggedIn(e => {
  var st = caosState(e.server)
  if (st.active) caosCmd(e.server, `bossbar set ${CAOS_BAR} players @a`)
})

ServerEvents.commandRegistry(event => {
  var Commands = event.commands, Arguments = event.arguments
  var evArg = Commands.argument('evento', Arguments.WORD.create(event))
    .suggests((ctx, b) => { Object.keys(CAOS_EVENTS).forEach(k => b.suggest(k)); return b.buildFuture() })
    .executes(ctx => {
      var id = String(Arguments.WORD.getResult(ctx, 'evento'))
      if (!CAOS_EVENTS[id]) { ctx.source.sendSystemMessage(Text.red('Eventos: ' + Object.keys(CAOS_EVENTS).join(', '))); return 0 }
      caosStart(ctx.source.server, id)
      return 1
    })
  event.register(Commands.literal('caos').requires(s => s.hasPermission(2))
    .then(Commands.literal('iniciar').then(evArg))
    .then(Commands.literal('parar').executes(ctx => { caosEnd(ctx.source.server, false); return 1 }))
    .then(Commands.literal('activar').executes(ctx => { var st = caosState(ctx.source.server); st.enabled = true; caosSave(ctx.source.server, st); ctx.source.sendSystemMessage(Text.green('Eventos del Caos activados')); return 1 }))
    .then(Commands.literal('desactivar').executes(ctx => { var st = caosState(ctx.source.server); st.enabled = false; caosSave(ctx.source.server, st); ctx.source.sendSystemMessage(Text.yellow('Eventos del Caos desactivados (el actual sigue hasta terminar)')); return 1 }))
    .then(Commands.literal('estado').executes(ctx => {
      var server = ctx.source.server, st = caosState(server), now = caosNow(server)
      ctx.source.sendSystemMessage(Text.yellow(`Caos ${st.enabled ? 'activado' : 'desactivado'} | activo: ${st.active || '-'}${st.active ? ' (quedan ' + Math.ceil((st.end - now) / 20) + ' s)' : ''} | próxima tirada en ${Math.max(0, Math.ceil((st.next - now) / 20))} s | día ${Math.floor(caosDayTime(server) / 24000)}, fase lunar ${server.overworld().getMoonPhase()}`))
      return 1
    })))
})
