// Zona segura del spawn + casino: sin mobs hostiles, sin daño a jugadores, nadie rompe/pone bloques,
// sin explosiones, rayos, fuego, baldes ni entidades colocables. Solo un op en creativo puede editar.

let SAFE_BANNED_ITEMS = /(water|lava|powder_snow|axolotl|cod|salmon|pufferfish|tropical_fish|tadpole)_bucket$|^minecraft:bucket$|flint_and_steel|fire_charge|item_frame|painting|armor_stand|minecart|_boat$|_raft$|spawn_egg|end_crystal|bone_meal|ender_pearl|chorus_fruit/

function safeBannedUse(player, item, x, z) {
  if (!player || global.isHubAdmin(player)) return false
  if (!global.inHub(player.level, x, z)) return false
  return SAFE_BANNED_ITEMS.test(String(item.id))
}

// Mobs hostiles: no aparecen dentro…
EntityEvents.checkSpawn(e => {
  var en = e.entity
  if (en.monster && global.inHub(e.level, en.x, en.z)) e.cancel()
})

EntityEvents.spawned(e => {
  var en = e.entity
  if (!global.inHub(e.level, en.x, en.z)) return
  var type = String(en.type)
  if (en.monster || type == 'minecraft:lightning_bolt' || type == 'minecraft:tnt' || type == 'minecraft:end_crystal') e.cancel()
})

// …y los que entran caminando, volando o persiguiendo a alguien se eliminan (barrido cada segundo).
let safeTick = 0
ServerEvents.tick(e => {
  if (++safeTick % 20 != 0 || !global.hub) return
  var level = e.server.overworld()
  level.getEntities(null, global.hubBox()).forEach(en => {
    if (en.monster && !en.player) en.discard()
  })
})

// Jugadores: cero daño dentro de la zona (PvP, caída, fuego, flechas…)
EntityEvents.hurt(e => {
  var en = e.entity
  if (en.player && global.inHub(en.level, en.x, en.z)) e.cancel()
})

// Bloques: nadie rompe ni pone, salvo op en creativo
BlockEvents.broken(e => {
  if (global.inHub(e.level, e.block.x, e.block.z) && !global.isHubAdmin(e.player)) e.cancel()
})

BlockEvents.placed(e => {
  var p = e.entity && e.entity.player ? e.entity : null
  if (global.inHub(e.level, e.block.x, e.block.z) && !global.isHubAdmin(p)) e.cancel()
})

BlockEvents.farmlandTrampled(e => {
  if (global.inHub(e.level, e.block.x, e.block.z)) e.cancel()
})

// Baldes, fuego, entidades colocables, perlas (para no teletransportarse dentro de bloques)
ItemEvents.rightClicked(e => {
  if (safeBannedUse(e.player, e.item, e.player.x, e.player.z)) {
    e.player.setStatusMessage(Text.red('No puedes usar eso en la zona segura'))
    e.cancel()
  }
})

BlockEvents.rightClicked(e => {
  if (safeBannedUse(e.player, e.item, e.block.x, e.block.z)) {
    e.player.setStatusMessage(Text.red('No puedes usar eso en la zona segura'))
    e.cancel()
  }
})

// Explosiones que alcancen la zona (margen de 8 bloques)
LevelEvents.beforeExplosion(e => {
  var h = global.hub
  if (!h || String(e.level.dimension) != 'minecraft:overworld') return
  if (e.x >= h.minX - 8 && e.x <= h.maxX + 9 && e.z >= h.minZ - 8 && e.z <= h.maxZ + 9) e.cancel()
})
