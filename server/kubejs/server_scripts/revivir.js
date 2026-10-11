// Revivir por consola (admin): /revivir <jugador> [muerte|<otro jugador>]
// - muerte (por defecto): donde murió · <otro jugador>: a su lado.
// - Si el muerto no está conectado o sigue en la pantalla de muerte, queda pendiente y se aplica solo
//   en cuanto aparezca como espectador.
// - Orden: primero supervivencia y después el tp (si no, la cámara de espectador lo arrastra).

function revState(server) {
  var s = String(server.persistentData.getString('revivir'))
  return s ? JSON.parse(s) : {}
}
function revSave(server, st) { server.persistentData.putString('revivir', JSON.stringify(st)) }

function revDo(server, p, destino) {
  var name = String(p.username)
  var tp = null
  if (destino == 'muerte') {
    var d = p.getLastDeathLocation()
    if (d.isPresent()) {
      var g = d.get(), bp = g.pos()
      tp = `execute in ${String(g.dimension().location())} run tp ${name} ${bp.x + 0.5} ${bp.y} ${bp.z + 0.5}`
    }
  } else if (server.playerList.getPlayerByName(destino)) {
    tp = `execute at ${destino} run tp ${name} ~ ~ ~`
  }
  server.runCommandSilent(`gamemode survival ${name}`)
  server.scheduleInTicks(2, () => {
    if (tp) server.runCommandSilent(tp)
    server.runCommandSilent(`effect give ${name} minecraft:regeneration 10 1`)
    server.runCommandSilent(`effect give ${name} minecraft:fire_resistance 10 0`)
    server.runCommandSilent(`execute at ${name} run particle minecraft:totem_of_undying ~ ~1 ~ 0.5 1 0.5 0.4 120`)
    server.runCommandSilent('execute as @a at @s run playsound minecraft:item.totem.use master @s ~ ~ ~ 1 0.8')
    server.runCommandSilent(`tellraw @a ${JSON.stringify({ text: `${name} ha sido revivido${destino == 'muerte' ? ' donde murió' : ' junto a ' + destino}.`, color: 'light_purple', bold: true })}`)
  })
  console.info(`Revivir: ${name} (${destino})${tp ? '' : ' sin destino, se queda donde está'}`)
}

// Pendientes: una vez por segundo
let revTicker = 0
ServerEvents.tick(e => {
  if (++revTicker % 20 != 0) return
  var server = e.server
  var st = revState(server)
  var names = Object.keys(st)
  if (!names.length) return
  var changed = false
  names.forEach(n => {
    var p = server.playerList.getPlayerByName(n)
    if (!p || !p.isSpectator()) return
    revDo(server, p, st[n])
    delete st[n]
    changed = true
  })
  if (changed) revSave(server, st)
})

ServerEvents.commandRegistry(event => {
  var Commands = event.commands, Arguments = event.arguments
  var run = (ctx, destino) => {
    var server = ctx.source.server
    var name = String(Arguments.WORD.getResult(ctx, 'jugador'))
    var p = server.playerList.getPlayerByName(name)
    if (p && p.isSpectator()) {
      revDo(server, p, destino)
      ctx.source.sendSystemMessage(Text.green(`${name} revivido (${destino})`))
    } else if (p && !p.isSpectator() && p.health > 0) {
      ctx.source.sendSystemMessage(Text.yellow(`${name} no está muerto`))
    } else {
      var st = revState(server)
      st[name] = destino
      revSave(server, st)
      ctx.source.sendSystemMessage(Text.yellow(`${name} ${p ? 'está en la pantalla de muerte' : 'no está conectado'}: queda pendiente (${destino})`))
    }
    return 1
  }
  event.register(Commands.literal('revivir').requires(s => s.hasPermission(2))
    .then(Commands.argument('jugador', Arguments.WORD.create(event))
      .executes(ctx => run(ctx, 'muerte'))
      .then(Commands.argument('destino', Arguments.WORD.create(event))
        .executes(ctx => run(ctx, String(Arguments.WORD.getResult(ctx, 'destino')))))))
})
