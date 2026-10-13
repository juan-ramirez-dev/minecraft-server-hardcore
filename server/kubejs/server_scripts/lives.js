// 3 vidas: las 2 primeras muertes reaparecen solas en supervivencia (cama o spawn); la 3ª es la definitiva
// y recién ahí entra el flujo de siempre (espectador + Cofre del Alma / /revivir).
// - Un revivido (por /revivir o el Cofre) vuelve con 1 vida: su contador sigue gastado.
// - Con hardcore=true el server pone espectador justo después del respawn → se pasa a supervivencia unos ticks más tarde.
// - Lo llama soul_chest.js desde su EntityEvents.death (global.vidasMuerte) para que el orden sea fijo.
// Las vidas de los conectados se ven en el marcador de la derecha (sidebar).
// Admin (consola): /vidas <jugador> [n]
// Nota Rhino: dentro de funciones se usa `var`.

const VIDAS_MAX = 3

function vidasState(server) {
  var s = String(server.persistentData.getString('vidas'))
  var st = s ? JSON.parse(s) : {}
  if (!st.muertes) st.muertes = {}
  if (!st.respawn) st.respawn = {}
  return st
}
function vidasSave(server, st) { server.persistentData.putString('vidas', JSON.stringify(st)) }
function vidasTell(server, parts) { server.runCommandSilent(`tellraw @a ${JSON.stringify([{ text: '[Vidas] ', color: 'red', bold: true }].concat(parts))}`) }

global.vidasRestantes = (server, name) => Math.max(0, VIDAS_MAX - (vidasState(server).muertes[name] || 0))

// Registra la muerte. Devuelve true si fue la definitiva.
global.vidasMuerte = (server, player) => {
  var name = String(player.username)
  var st = vidasState(server)
  var m = (st.muertes[name] || 0) + 1
  st.muertes[name] = m
  var quedan = VIDAS_MAX - m
  if (quedan > 0) st.respawn[name] = true
  vidasSave(server, st)
  if (quedan > 0) {
    vidasTell(server, [{ text: `${name} murió — le ${quedan == 1 ? 'queda' : 'quedan'} `, color: 'gray' },
      { text: `${quedan} ${quedan == 1 ? 'vida' : 'vidas'}`, color: 'gold' }, { text: '. Reaparece en su cama o en el spawn.', color: 'gray' }])
  } else {
    vidasTell(server, [{ text: `${name} perdió su última vida.`, color: 'dark_red' }])
  }
  console.info(`Vidas: ${name} murió (${m}/${VIDAS_MAX})${quedan > 0 ? '' : ' — definitiva'}`)
  return quedan <= 0
}

function vidasRevive(server, p, st) {
  var name = String(p.username)
  delete st.respawn[name]
  vidasSave(server, st)
  server.runCommandSilent(`gamemode survival ${name}`)
  server.runCommandSilent(`effect give ${name} minecraft:resistance 10 4`)
  server.runCommandSilent(`effect give ${name} minecraft:regeneration 10 1`)
  var quedan = VIDAS_MAX - (st.muertes[name] || 0)
  p.tell(Text.gold(`Vida ${VIDAS_MAX - quedan + 1}/${VIDAS_MAX}`).append(Text.gray(` — te ${quedan == 1 ? 'queda' : 'quedan'} ${quedan}.`)))
}

PlayerEvents.respawned(e => {
  var p = e.player, server = e.server
  if (!vidasState(server).respawn[String(p.username)]) return
  server.scheduleInTicks(3, () => {
    var st = vidasState(server)
    var q = server.playerList.getPlayerByName(String(p.username))
    if (q && st.respawn[String(q.username)] && q.isSpectator()) vidasRevive(server, q, st)
  })
})

// Marcador a la derecha de la pantalla (sidebar): vidas de los conectados
const VIDAS_OBJ = 'vidas'
let vidasMostrados = []
function vidasSidebar(server, st) {
  if (vidasTicker == 20) {
    server.runCommandSilent(`scoreboard objectives add ${VIDAS_OBJ} dummy ${JSON.stringify({ text: '❤ Vidas', color: 'red', bold: true })}`)
    server.runCommandSilent(`scoreboard objectives setdisplay sidebar ${VIDAS_OBJ}`)
  }
  var ahora = []
  server.players.forEach(p => {
    var n = String(p.username)
    ahora.push(n)
    var v = Math.max(0, VIDAS_MAX - (st.muertes[n] || 0))
    if (p.isSpectator() && !st.respawn[n]) v = 0
    server.runCommandSilent(`scoreboard players set ${n} ${VIDAS_OBJ} ${v}`)
  })
  vidasMostrados.forEach(n => { if (ahora.indexOf(n) < 0) server.runCommandSilent(`scoreboard players reset ${n} ${VIDAS_OBJ}`) })
  vidasMostrados = ahora
}

// Respaldo una vez por segundo (p. ej. se desconectó en la pantalla de muerte) + migración única
let vidasTicker = 0
ServerEvents.tick(e => {
  if (++vidasTicker % 20 != 0) return
  var server = e.server
  if (!server.persistentData.getBoolean('vidas_v1')) vidasMigrar(server)
  var st = vidasState(server)
  vidasSidebar(server, st)
  if (!Object.keys(st.respawn).length) return
  server.players.forEach(p => {
    if (st.respawn[String(p.username)] && p.isSpectator()) vidasRevive(server, p, st)
  })
})

// Al activar el sistema: los que ya estaban muertos vuelven (donde murieron) con 3 vidas
function vidasMigrar(server) {
  server.persistentData.putBoolean('vidas_v1', true)
  var rs = String(server.persistentData.getString('revivir'))
  var rev = rs ? JSON.parse(rs) : {}
  var as = String(server.persistentData.getString('alma'))
  var alma = as ? JSON.parse(as) : {}
  var muertos = (alma.dead || []).slice()
  server.players.forEach(p => {
    var n = String(p.username)
    if (p.isSpectator() && !p.getTags().contains('espectador_libre') && muertos.indexOf(n) < 0) muertos.push(n)
  })
  muertos.forEach(n => { if (!rev[n]) rev[n] = 'muerte' })
  server.persistentData.putString('revivir', JSON.stringify(rev))
  if (alma.dead) {
    alma.dead = []
    if (!alma.active) alma.next = 0
    server.persistentData.putString('alma', JSON.stringify(alma))
  }
  vidasSave(server, { muertes: {}, respawn: {} })
  console.info(`Vidas: sistema activado; revivir pendiente para: ${muertos.join(', ') || '(nadie)'}`)
  vidasTell(server, [{ text: `Desde ahora cada uno tiene ${VIDAS_MAX} vidas. Los caídos vuelven donde murieron.`, color: 'gold' }])
}

ServerEvents.commandRegistry(event => {
  var Commands = event.commands, Arguments = event.arguments
  var show = (ctx) => {
    var name = String(Arguments.WORD.getResult(ctx, 'jugador'))
    ctx.source.sendSystemMessage(Text.gold(`${name}: ${global.vidasRestantes(ctx.source.server, name)}/${VIDAS_MAX} vidas`))
    return 1
  }
  var set = (ctx) => {
    var server = ctx.source.server
    var name = String(Arguments.WORD.getResult(ctx, 'jugador'))
    var n = Math.max(0, Math.min(VIDAS_MAX, Arguments.INTEGER.getResult(ctx, 'n')))
    var st = vidasState(server)
    st.muertes[name] = VIDAS_MAX - n
    vidasSave(server, st)
    ctx.source.sendSystemMessage(Text.green(`${name}: ${n}/${VIDAS_MAX} vidas`))
    return 1
  }
  event.register(Commands.literal('vidas').requires(s => s.hasPermission(2))
    .then(Commands.argument('jugador', Arguments.WORD.create(event))
      .executes(show)
      .then(Commands.argument('n', Arguments.INTEGER.create(event)).executes(set))))
})
