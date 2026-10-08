// Espectador restringido: un muerto solo ve a través de los ojos de un jugador vivo.
// - Si no está siguiendo a nadie (p. ej. presionó Shift), se engancha al siguiente vivo → Shift sirve para alternar.
// - Si no hay nadie vivo conectado, queda fijo en el spawn.
// - Un admin puede librarse con: /tag <jugador> add espectador_libre

// ¿Ya está viendo a través de un vivo? (cámara = vivo; respaldo: está pegado a la posición de un vivo)
function specFollowingAlive(p, alive) {
  try {
    var camId = String(p.getCamera().uuid)
    if (camId == String(p.uuid)) return false
    for (var i = 0; i < alive.length; i++) if (String(alive[i].uuid) == camId) return true
    return false
  } catch (err) {
    for (var j = 0; j < alive.length; j++) {
      var q = alive[j]
      if (String(q.level.dimension) == String(p.level.dimension) && Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 2.5 && Math.abs(q.z - p.z) < 1) return true
    }
    return false
  }
}

let specTicker = 0
ServerEvents.tick(e => {
  if (++specTicker % 10 != 0) return
  var server = e.server
  var alive = []
  server.players.forEach(p => { if (!p.isSpectator()) alive.push(p) })

  server.players.forEach(p => {
    if (!p.isSpectator() || p.getTags().contains('espectador_libre')) return
    var name = String(p.username)
    if (!alive.length) {
      var sp = global.hubSpawn() || (() => { var s = server.overworld().getSharedSpawnPos(); return [s.x, s.y, s.z] })()
      if (String(p.level.dimension) != 'minecraft:overworld' || Math.abs(p.x - sp[0] - 0.5) > 1.5 || Math.abs(p.z - sp[2] - 0.5) > 1.5 || Math.abs(p.y - sp[1]) > 3)
        server.runCommandSilent(`execute in minecraft:overworld run tp ${name} ${sp[0] + 0.5} ${sp[1]} ${sp[2] + 0.5}`)
      return
    }
    if (specFollowingAlive(p, alive)) return
    var idx = (p.persistentData.getInt('spec_idx') + 1) % alive.length
    p.persistentData.putInt('spec_idx', idx)
    server.runCommandSilent(`spectate ${alive[idx].username} ${name}`)
    p.setStatusMessage(Text.gray('Viendo a ').append(Text.gold(alive[idx].username)).append(Text.gray(' — Shift para cambiar')))
  })
})
