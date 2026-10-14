// Gulag "Último en pie": los muertos definitivos conectados pelean juntos contra oleadas de mobs en una arena subterránea.
// Sobrevive la mitad (redondeando hacia abajo, mínimo 1): cuando quedan esos, vuelven al lobby con 1 vida.
// - Morir en el gulag no gasta vidas ni crea Cofre del Alma (soul_chest.js llama a global.gulagMuerte primero):
//   el que cae vuelve a ser espectador por el respawn de hardcore. Desconectarse = eliminado.
// - Arena: caja de deepslate a 200 bloques del hub en X, y=-40 (fuera de la zona segura). Se construye sola la 1.ª vez.
// - Todos con el mismo kit (hierro + arco + escudo). Oleadas cada vez más duras; la siguiente sale cuando no queda
//   ningún mob o a los 60 s. Los muertos que no pelean miran a través de los ojos de los que siguen (spectator.js).
// Admin (consola): /gulag iniciar | /gulag estado | /gulag cancelar | /gulag construir
// Nota Rhino: dentro de funciones se usa `var`.

const $GulagAABB = Java.loadClass('net.minecraft.world.phys.AABB')

const GULAG_R = 16            // radio interior de la arena
const GULAG_H = 12            // alto
const GULAG_Y = -40           // piso
const GULAG_PREP = 10 * 20    // cuenta atrás antes de la 1.ª oleada
const GULAG_OLA_MAX = 60 * 20 // una oleada dura como mucho 60 s
const GULAG_TAG = 'gulag_mob'

// Mobs por nivel de oleada: [tipo, NBT extra]
const GULAG_MOBS = [
  [['zombie', ''], ['skeleton', 'HandItems:[{id:"minecraft:bow",Count:1b},{}]'], ['spider', '']],
  [['husk', ''], ['stray', 'HandItems:[{id:"minecraft:bow",Count:1b},{}]'], ['cave_spider', ''], ['zombie', 'HandItems:[{id:"minecraft:iron_sword",Count:1b},{}]']],
  [['creeper', ''], ['witch', ''], ['skeleton', 'HandItems:[{id:"minecraft:bow",Count:1b,tag:{Enchantments:[{id:"minecraft:power",lvl:2s}]}},{}]']],
  [['vindicator', 'HandItems:[{id:"minecraft:iron_axe",Count:1b},{}]'], ['pillager', 'HandItems:[{id:"minecraft:crossbow",Count:1b},{}]'], ['blaze', '']],
  [['wither_skeleton', 'HandItems:[{id:"minecraft:stone_sword",Count:1b},{}]'], ['evoker', ''], ['piglin_brute', 'HandItems:[{id:"minecraft:golden_axe",Count:1b},{}]']],
  [['ravager', ''], ['vindicator', 'HandItems:[{id:"minecraft:diamond_axe",Count:1b},{}]'], ['wither_skeleton', 'HandItems:[{id:"minecraft:stone_sword",Count:1b},{}]']]
]

function gulagState(server) {
  var s = String(server.persistentData.getString('gulag'))
  var st = s ? JSON.parse(s) : {}
  if (!st.activo) st.activo = false
  if (!st.vivos) st.vivos = []
  if (!st.caidos) st.caidos = []
  return st
}
function gulagSave(server, st) { server.persistentData.putString('gulag', JSON.stringify(st)) }
function gulagCmd(server, c) { return server.runCommandSilent(`execute in minecraft:overworld run ${c}`) }
function gulagNow(server) { return Number(server.overworld().getLevelData().getGameTime()) }
function gulagTell(server, parts) { server.runCommandSilent(`tellraw @a ${JSON.stringify([{ text: '[Gulag] ', color: 'dark_red', bold: true }].concat(parts))}`) }

// Centro de la arena (fijo una vez construida)
function gulagCentro(server, st) {
  if (st.centro) return st.centro
  var h = global.hub
  var x = h ? h.origin[0] + 200 : 200, z = h ? h.origin[2] : 0
  return [Math.floor(x), GULAG_Y, Math.floor(z)]
}
function gulagArea(c) { return `${c[0] - GULAG_R - 1} ${c[2] - GULAG_R - 1} ${c[0] + GULAG_R + 1} ${c[2] + GULAG_R + 1}` }
function gulagBox(c) { return `x=${c[0] - GULAG_R},y=${c[1]},z=${c[2] - GULAG_R},dx=${GULAG_R * 2},dy=${GULAG_H},dz=${GULAG_R * 2}` }

function gulagConstruir(server, st, luego) {
  var c = gulagCentro(server, st), x = c[0], y = c[1], z = c[2], R = GULAG_R
  gulagCmd(server, `forceload add ${gulagArea(c)}`)
  server.scheduleInTicks(40, () => {
    gulagCmd(server, `fill ${x - R - 1} ${y - 1} ${z - R - 1} ${x + R + 1} ${y + GULAG_H + 1} ${z + R + 1} minecraft:deepslate_tiles hollow`)
    gulagCmd(server, `fill ${x - R} ${y - 1} ${z - R} ${x + R} ${y - 1} ${z + R} minecraft:polished_blackstone_bricks`)
    gulagCmd(server, `fill ${x - R} ${y + GULAG_H + 1} ${z - R} ${x + R} ${y + GULAG_H + 1} ${z + R} minecraft:deepslate_tiles`)
    // luz: rejilla de linternas de mar en piso y techo
    for (var i = -R + 2; i <= R - 2; i += 6) for (var j = -R + 2; j <= R - 2; j += 6) {
      gulagCmd(server, `setblock ${x + i} ${y - 1} ${z + j} minecraft:sea_lantern`)
      gulagCmd(server, `setblock ${x + i} ${y + GULAG_H + 1} ${z + j} minecraft:shroomlight`)
    }
    // 4 pilares para cubrirse
    ;[[-8, -8], [8, -8], [-8, 8], [8, 8]].forEach(p => gulagCmd(server, `fill ${x + p[0]} ${y} ${z + p[1]} ${x + p[0] + 1} ${y + 3} ${z + p[1] + 1} minecraft:cracked_deepslate_bricks`))
    st = gulagState(server)
    st.centro = c
    st.construida = true
    gulagSave(server, st)
    console.info(`Gulag: arena construida en ${c.join(' ')}`)
    if (!st.activo) gulagCmd(server, `forceload remove ${gulagArea(c)}`)
    if (luego) luego()
  })
}

// Muertos definitivos conectados (espectadores sin vidas, salvo admins con espectador_libre)
function gulagCandidatos(server) {
  var lista = []
  server.players.forEach(p => {
    var n = String(p.username)
    if (p.isSpectator() && !p.getTags().contains('espectador_libre') && (!global.vidasRestantes || global.vidasRestantes(server, n) <= 0)) lista.push(n)
  })
  return lista
}

function gulagKit(server, n) {
  server.runCommandSilent(`clear ${n}`)
  ;[['head', 'iron_helmet'], ['chest', 'iron_chestplate'], ['legs', 'iron_leggings'], ['feet', 'iron_boots']].forEach(a => server.runCommandSilent(`item replace entity ${n} armor.${a[0]} with minecraft:${a[1]}`))
  server.runCommandSilent(`item replace entity ${n} weapon.offhand with minecraft:shield`)
  server.runCommandSilent(`give ${n} minecraft:iron_sword`)
  server.runCommandSilent(`give ${n} minecraft:bow`)
  server.runCommandSilent(`give ${n} minecraft:arrow 32`)
  server.runCommandSilent(`give ${n} minecraft:cooked_beef 8`)
  server.runCommandSilent(`give ${n} minecraft:golden_apple 2`)
}

function gulagIniciar(server, src) {
  var st = gulagState(server)
  if (st.activo) { src.sendSystemMessage(Text.red('Ya hay un gulag en curso')); return }
  var lista = gulagCandidatos(server)
  if (lista.length < 2) { src.sendSystemMessage(Text.red(`Hacen falta al menos 2 muertos conectados (hay ${lista.length}: ${lista.join(', ') || '-'})`)); return }
  var arrancar = () => {
    st = gulagState(server)
    var c = gulagCentro(server, st)
    st.activo = true
    st.vivos = lista.slice()
    st.caidos = []
    st.meta = Math.max(1, Math.floor(lista.length / 2))
    st.ola = 0
    st.olaInicio = 0
    st.inicio = gulagNow(server) + GULAG_PREP
    gulagSave(server, st)
    gulagCmd(server, `forceload add ${gulagArea(c)}`)
    gulagCmd(server, `kill @e[${gulagBox(c)},type=!minecraft:player]`)
    lista.forEach((n, i) => {
      var a = 6.283185307179586 * i / lista.length
      server.runCommandSilent(`gamemode adventure ${n}`)
      gulagCmd(server, `tp ${n} ${c[0] + 0.5 + Math.round(Math.cos(a) * 4)} ${c[1]} ${c[2] + 0.5 + Math.round(Math.sin(a) * 4)}`)
      gulagKit(server, n)
      server.runCommandSilent(`effect clear ${n}`)
      server.runCommandSilent(`effect give ${n} minecraft:instant_health 1 10`)
      server.runCommandSilent(`effect give ${n} minecraft:saturation 5 10`)
      server.runCommandSilent(`effect give ${n} minecraft:resistance 10 4`)
    })
    server.runCommandSilent('title @a times 10 70 20')
    server.runCommandSilent(`title @a subtitle ${JSON.stringify({ text: `Sobreviven ${st.meta} de ${lista.length}. Oleadas en 10 s.`, color: 'white' })}`)
    server.runCommandSilent(`title @a title ${JSON.stringify({ text: 'GULAG', color: 'dark_red', bold: true })}`)
    server.runCommandSilent('execute as @a at @s run playsound minecraft:entity.wither.spawn master @s ~ ~ ~ 0.7 0.7')
    gulagTell(server, [{ text: `${lista.join(', ')} pelean por volver. `, color: 'white' },
      { text: `Solo ${st.meta} de ${lista.length} salen vivos`, color: 'gold', bold: true }, { text: ': los últimos en pie contra oleadas de monstruos.', color: 'white' }])
    console.info(`Gulag: empieza con ${lista.join(', ')} (sobreviven ${st.meta})`)
  }
  if (st.construida) arrancar()
  else { src.sendSystemMessage(Text.yellow('Construyendo la arena (3 s)…')); gulagConstruir(server, st, arrancar) }
}

function gulagOla(server, st) {
  var c = gulagCentro(server, st)
  st.ola++
  st.olaInicio = gulagNow(server)
  var nivel = Math.min(GULAG_MOBS.length, st.ola)
  var pool = []
  for (var k = 0; k < nivel; k++) pool = pool.concat(GULAG_MOBS[k])
  var cant = Math.min(30, st.vivos.length + st.ola * 2)
  for (var i = 0; i < cant; i++) {
    // los más nuevos (más duros) salen el doble de seguido
    var m = Math.random() < 0.5 ? GULAG_MOBS[nivel - 1][Math.floor(Math.random() * GULAG_MOBS[nivel - 1].length)] : pool[Math.floor(Math.random() * pool.length)]
    var a = Math.random() * 6.283185307179586, r = 10 + Math.random() * 4
    var nbt = `{Tags:["${GULAG_TAG}"],PersistenceRequired:1b${m[1] ? ',' + m[1] : ''}}`
    gulagCmd(server, `summon minecraft:${m[0]} ${c[0] + 0.5 + Math.cos(a) * r} ${c[1]} ${c[2] + 0.5 + Math.sin(a) * r} ${nbt}`)
  }
  gulagSave(server, st)
  server.runCommandSilent(`title @a actionbar ${JSON.stringify({ text: `Gulag — oleada ${st.ola} (${cant} monstruos) · quedan ${st.vivos.length}, salen ${st.meta}`, color: 'red' })}`)
}

function gulagEliminar(server, st, n, motivo) {
  var i = st.vivos.indexOf(n)
  if (i < 0) return
  st.vivos.splice(i, 1)
  st.caidos.push(n)
  gulagSave(server, st)
  gulagTell(server, [{ text: `${n} ${motivo}. `, color: 'gray' }, { text: `Quedan ${st.vivos.length}, salen ${st.meta}.`, color: 'gold' }])
}

function gulagTerminar(server, st, cancelado) {
  var c = gulagCentro(server, st)
  gulagCmd(server, `kill @e[${gulagBox(c)},type=!minecraft:player]`)
  var ganadores = cancelado ? [] : st.vivos.slice()
  var sp = global.hubSpawn ? global.hubSpawn() : false
  var sv = String(server.persistentData.getString('vidas')), vidas = sv ? JSON.parse(sv) : { muertes: {}, respawn: {} }
  var sa = String(server.persistentData.getString('alma')), alma = sa ? JSON.parse(sa) : null
  ;(cancelado ? st.vivos : ganadores).forEach(n => {
    var p = server.playerList.getPlayerByName(n)
    if (!p) return
    if (cancelado) {
      server.runCommandSilent(`clear ${n}`)
      server.runCommandSilent(`gamemode spectator ${n}`)
      return
    }
    server.runCommandSilent(`gamemode survival ${n}`)
    if (sp) gulagCmd(server, `tp ${n} ${sp[0] + 0.5} ${sp[1]} ${sp[2] + 0.5}`)
    server.runCommandSilent(`effect clear ${n}`)
    server.runCommandSilent(`effect give ${n} minecraft:regeneration 10 2`)
    server.runCommandSilent(`execute at ${n} run particle minecraft:totem_of_undying ~ ~1 ~ 0.5 1 0.5 0.4 120`)
  })
  ganadores.forEach(n => {
    vidas.muertes[n] = 2   // vuelven con 1 vida
    if (alma && alma.dead) { var i = alma.dead.indexOf(n); if (i >= 0) alma.dead.splice(i, 1) }
  })
  server.persistentData.putString('vidas', JSON.stringify(vidas))
  if (alma) server.persistentData.putString('alma', JSON.stringify(alma))
  st.activo = false
  st.vivos = []
  gulagSave(server, st)
  gulagCmd(server, `forceload remove ${gulagArea(c)}`)
  if (cancelado) { gulagTell(server, [{ text: 'El gulag fue cancelado.', color: 'gray' }]); return }
  server.runCommandSilent('title @a times 10 70 20')
  server.runCommandSilent(`title @a subtitle ${JSON.stringify({ text: ganadores.join(', ') || 'nadie', color: 'white' })}`)
  server.runCommandSilent(`title @a title ${JSON.stringify({ text: 'Salen del gulag', color: 'gold', bold: true })}`)
  server.runCommandSilent('execute as @a at @s run playsound minecraft:item.totem.use master @s ~ ~ ~ 1 0.8')
  gulagTell(server, [{ text: `${ganadores.join(', ') || 'Nadie'} ${ganadores.length == 1 ? 'sobrevivió' : 'sobrevivieron'} ${st.ola} oleadas y ${ganadores.length == 1 ? 'vuelve' : 'vuelven'} al mundo con 1 vida.`, color: 'gold', bold: true }])
  console.info(`Gulag: terminó tras ${st.ola} oleadas; ganan ${ganadores.join(', ')}`)
}

// La llama soul_chest.js antes que nada: true = era una muerte de gulag (no gasta vidas ni crea Cofre del Alma)
global.gulagMuerte = (server, player) => {
  var st = gulagState(server)
  var n = String(player.username)
  if (!st.activo || st.vivos.indexOf(n) < 0) return false
  gulagEliminar(server, st, n, 'cayó en el gulag')
  return true
}

let gulagTicker = 0
ServerEvents.tick(e => {
  if (++gulagTicker % 20 != 0) return
  var server = e.server
  var st = gulagState(server)
  if (!st.activo) return
  var c = gulagCentro(server, st)
  // limpiar lo que tiran los caídos
  gulagCmd(server, `kill @e[${gulagBox(c)},type=minecraft:item]`)
  gulagCmd(server, `kill @e[${gulagBox(c)},type=minecraft:experience_orb]`)
  // alguien se salió de la arena (o se desconectó): eliminado
  st.vivos.slice().forEach(n => {
    var p = server.playerList.getPlayerByName(n)
    if (!p) { gulagEliminar(server, st, n, 'abandonó el gulag'); return }
    if (!p.isSpectator() && (Math.abs(p.x - c[0]) > GULAG_R + 3 || Math.abs(p.z - c[2]) > GULAG_R + 3 || p.y < c[1] - 3 || p.y > c[1] + GULAG_H + 3))
      gulagCmd(server, `tp ${n} ${c[0] + 0.5} ${c[1]} ${c[2] + 0.5}`)
  })
  if (st.vivos.length <= st.meta) { gulagTerminar(server, st, false); return }
  var now = gulagNow(server)
  if (now < st.inicio) {
    var s = Math.ceil((st.inicio - now) / 20)
    server.runCommandSilent(`title @a actionbar ${JSON.stringify({ text: `Gulag — primera oleada en ${s} s`, color: 'gold' })}`)
    return
  }
  var quedan = 0
  server.overworld().getEntities(null, new $GulagAABB(c[0] - GULAG_R - 2, c[1] - 2, c[2] - GULAG_R - 2, c[0] + GULAG_R + 2, c[1] + GULAG_H + 2, c[2] + GULAG_R + 2))
    .forEach(en => { if (en.getTags().contains(GULAG_TAG) && en.isAlive()) quedan++ })
  if (st.ola == 0 || quedan == 0 || now - st.olaInicio >= GULAG_OLA_MAX) { gulagOla(server, st); return }
  server.runCommandSilent(`title @a actionbar ${JSON.stringify({ text: `Gulag — oleada ${st.ola} · ${quedan} monstruos · quedan ${st.vivos.length}, salen ${st.meta}`, color: 'red' })}`)
})

// El que abandonó y vuelve a entrar sigue muerto
PlayerEvents.loggedIn(e => {
  var st = gulagState(e.server)
  var n = String(e.player.username)
  if (st.caidos.indexOf(n) >= 0 && !e.player.isSpectator() && st.vivos.indexOf(n) < 0 && (!global.vidasRestantes || global.vidasRestantes(e.server, n) <= 0)) {
    e.server.runCommandSilent(`clear ${n}`)
    e.server.runCommandSilent(`gamemode spectator ${n}`)
  }
})

ServerEvents.commandRegistry(event => {
  var Commands = event.commands
  event.register(Commands.literal('gulag').requires(s => s.hasPermission(2))
    .then(Commands.literal('iniciar').executes(ctx => { gulagIniciar(ctx.source.server, ctx.source); return 1 }))
    .then(Commands.literal('construir').executes(ctx => {
      var server = ctx.source.server
      gulagConstruir(server, gulagState(server), null)
      ctx.source.sendSystemMessage(Text.yellow(`Construyendo la arena en ${gulagCentro(server, gulagState(server)).join(' ')} (3 s)`))
      return 1
    }))
    .then(Commands.literal('cancelar').executes(ctx => {
      var st = gulagState(ctx.source.server)
      if (st.activo) gulagTerminar(ctx.source.server, st, true)
      return 1
    }))
    .then(Commands.literal('estado').executes(ctx => {
      var server = ctx.source.server, st = gulagState(server)
      ctx.source.sendSystemMessage(Text.yellow(st.activo
        ? `Gulag en curso: oleada ${st.ola} | en pie: ${st.vivos.join(', ')} | caídos: ${st.caidos.join(', ') || '-'} | salen ${st.meta}`
        : `Sin gulag. Arena ${st.construida ? 'construida en ' + st.centro.join(' ') : 'sin construir'} | muertos conectados: ${gulagCandidatos(server).join(', ') || '-'}`))
      return 1
    })))
})
