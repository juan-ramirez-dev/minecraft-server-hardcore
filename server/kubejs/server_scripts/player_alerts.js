// Alertas en el chat para todos:
// - Cuando un jugador queda con pocos corazones (≤ ALERTA_HP). Se rearma al curarse por encima de ALERTA_REARM.
// - Cuando un jugador usa un Tótem de la Inmortalidad (estadística minecraft.used, vía scoreboard).
// Nota Rhino: dentro de funciones se usa `var`.

const ALERTA_HP = 6      // 3 corazones
const ALERTA_REARM = 10  // 5 corazones
const ALERTA_TOTEM_OBJ = 'hc_totem'

function alertaTellAll(server, parts) {
  server.runCommandSilent(`tellraw @a ${JSON.stringify([{ text: '[Alerta] ', color: 'red', bold: true }].concat(parts))}`)
}

function alertaDim(p) {
  var d = String(p.level.dimension)
  if (d == 'minecraft:overworld') return 'Overworld'
  if (d == 'minecraft:the_nether') return 'Nether'
  if (d == 'minecraft:the_end') return 'End'
  return d
}

function alertaPos(p) { return `${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)} (${alertaDim(p)})` }

let alertaTicker = 0
ServerEvents.tick(e => {
  if (++alertaTicker % 10 != 0) return
  var server = e.server
  // crea el objetivo al arrancar y tras /reload (si ya existe, falla en silencio)
  if (alertaTicker == 10) server.runCommandSilent(`scoreboard objectives add ${ALERTA_TOTEM_OBJ} minecraft.used:minecraft.totem_of_undying`)

  server.players.forEach(p => {
    if (p.isSpectator() || p.isCreative()) return
    var name = String(p.username)
    var data = p.persistentData

    // Tótem: el scoreboard sube 1 por cada tótem consumido
    var used = server.runCommandSilent(`scoreboard players get ${name} ${ALERTA_TOTEM_OBJ}`)
    if (used > 0) {
      server.runCommandSilent(`scoreboard players reset ${name} ${ALERTA_TOTEM_OBJ}`)
      alertaTellAll(server, [
        { text: name, color: 'gold', bold: true },
        { text: ' usó un Tótem de la Inmortalidad', color: 'yellow' },
        { text: ` en ${alertaPos(p)}`, color: 'gray' }
      ])
      data.putBoolean('alerta_hp', true) // evita doble aviso: el tótem lo deja en medio corazón
      return
    }

    // Pocos corazones
    var hp = p.health
    if (hp <= ALERTA_HP && !data.getBoolean('alerta_hp')) {
      data.putBoolean('alerta_hp', true)
      alertaTellAll(server, [
        { text: name, color: 'gold', bold: true },
        { text: ` está a ${Math.ceil(hp) / 2} ❤`, color: 'red' },
        { text: ` en ${alertaPos(p)}`, color: 'gray' }
      ])
    } else if (hp > ALERTA_REARM && data.getBoolean('alerta_hp')) {
      data.putBoolean('alerta_hp', false)
    }
  })
})
