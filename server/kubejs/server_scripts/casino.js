// Casino del spawn: tragamonedas (1 esmeralda) y Cofre del Destino (8 esmeraldas).
// Premios de cualquier mod: ítems elegidos a mano + loot de cofres de estructuras de todos los mods
// (tablas auditadas: sin netherite, materiales de jefes, tótems/ítems de revivir, élitros ni artefactos de Incendium).

let CASINO = {
  slotCost: 1,
  destinoCost: 8,
  // [peso, nivel]
  tiers: [[45, 'nada'], [30, 'comun'], [18, 'raro'], [6, 'epico'], [1, 'jackpot']],
  comun: [
    ['minecraft:cooked_beef', 8], ['minecraft:golden_carrot', 6], ['minecraft:bread', 12], ['minecraft:arrow', 16],
    ['minecraft:experience_bottle', 6], ['minecraft:iron_ingot', 6], ['minecraft:gold_ingot', 5], ['minecraft:gunpowder', 6],
    ['minecraft:ender_pearl', 2], ['minecraft:torch', 24], ['minecraft:coal', 12], ['minecraft:lapis_lazuli', 10],
    ['born_in_chaos_v1:mint_candy', 3], ['born_in_chaos_v1:caramel_pepper', 3], ['mowziesmobs:glowing_jelly', 4],
    ['mowziesmobs:dart', 16], ['minecraft:cooked_salmon', 8]
  ],
  epico: [
    ['sophisticatedbackpacks:backpack', 1], ['sophisticatedbackpacks:copper_backpack', 1], ['sophisticatedbackpacks:iron_backpack', 1],
    ['sophisticatedbackpacks:pickup_upgrade', 1], ['sophisticatedbackpacks:magnet_upgrade', 1], ['sophisticatedbackpacks:feeding_upgrade', 1],
    ['sophisticatedbackpacks:crafting_upgrade', 1], ['sophisticatedbackpacks:refill_upgrade', 1],
    ['minecraft:diamond', 3], ['minecraft:golden_apple', 2], ['minecraft:experience_bottle', 24], ['minecraft:name_tag', 1],
    ['minecraft:saddle', 1], ['born_in_chaos_v1:mint_ice_cream', 2], ['minecraft:emerald', 6]
  ],
  jackpot: [
    ['minecraft:totem_of_undying', 1], ['minecraft:enchanted_golden_apple', 1], ['minecraft:diamond', 8],
    ['sophisticatedbackpacks:gold_backpack', 1], ['minecraft:emerald', 24]
  ],
  // loot "raro": cofres comunes/medios de estructuras de todos los mods
  raro: [
    'betterdeserttemples:chests/storage', 'betterdeserttemples:chests/lab', 'betterdeserttemples:chests/wardrobe',
    'betterdungeons:skeleton_dungeon/chests/middle', 'betterdungeons:zombie_dungeon/chests/tombstone',
    'betterfortresses:chests/hall', 'betterfortresses:chests/quarters', 'betterfortresses:chests/storage',
    'betterjungletemples:chests/campsite', 'betterstrongholds:chests/common', 'betterstrongholds:chests/armoury',
    'betterstrongholds:chests/mess', 'betterwitchhuts:chests/hut_0',
    'explorify:chest/dark_forest_settlement', 'explorify:chest/supply_cache',
    'incendium:castle/barrel/barracks', 'incendium:sanctum/common_loot', 'incendium:sanctum/brewery',
    'mes:mega_ship_barrel', 'mowziesmobs:chests/umvuthana_grove_chest',
    'nova_structures:chests/illager_hideout_weaponry', 'nova_structures:chests/creeping_crypt/crypt_hallway',
    'nova_structures:chests/desert_ruins/desert_ruin_house', 'nova_structures:chests/stray_fort_loot_generic',
    'nova_structures:chests/witch_villa/potion_brewing', 'nova_structures:chests/piglin_outstation/outstation_generic',
    'nova_structures:chests/nether_skeleton_tower/skeleton_tower_chest', 'nova_structures:chests/badland_miner_outpost',
    'sophisticatedbackpacks:inject/chests/simple_dungeon'
  ],
  // Cofre del Destino: cofres "de tesoro" de estructuras difíciles
  destino: [
    'betterstrongholds:chests/treasure', 'betterstrongholds:chests/crypt', 'betterfortresses:chests/keep',
    'betterfortresses:chests/worship', 'betterdeserttemples:chests/tomb', 'betterjungletemples:chests/treasure',
    'incendium:castle/treasure/quartz', 'incendium:sanctum/coffin', 'mes:mega_ship_barrel_empty_rare',
    'nova_structures:chests/stray_fort_tresure', 'nova_structures:chests/pillager_outpost_treasure',
    'nova_structures:chests/illager_hideout_heart_loot', 'nova_structures:chests/desert_ruins/desert_ruin_lesser_treasure',
    'nova_structures:chests/jungle_ruins/jungle_ruins_main_temple', 'sophisticatedbackpacks:inject/chests/desert_pyramid'
  ]
}

let SLOT_SYMBOLS = [['♣', 'green'], ['❤', 'red'], ['★', 'gold'], ['♦', 'aqua'], ['7', 'dark_red'], ['☠', 'gray']]
const TIER_SYMBOL = { comun: 0, raro: 3, epico: 2, jackpot: 4 }
const casinoSpinning = {}

let casRnd = n => Math.floor(Math.random() * n)
const casPick = arr => arr[casRnd(arr.length)]

function pickTier() {
  var total = CASINO.tiers.reduce((a, t) => a + t[0], 0)
  var r = Math.random() * total
  for (var i = 0; i < CASINO.tiers.length; i++) { r -= CASINO.tiers[i][0]; if (r < 0) return CASINO.tiers[i][1] }
  return 'nada'
}

function countItem(player, id) {
  var inv = player.inventory
  var n = 0
  for (var i = 0; i < inv.getContainerSize(); i++) {
    var s = inv.getItem(i)
    if (String(s.id) == id) n += s.count
  }
  return n
}

function takeItem(player, id, amount) {
  var inv = player.inventory
  for (var i = 0; i < inv.getContainerSize() && amount > 0; i++) {
    var s = inv.getItem(i)
    if (String(s.id) != id) continue
    var t = Math.min(s.count, amount)
    s.shrink(t)
    amount -= t
  }
  player.inventoryMenu.broadcastChanges()
}

function machineAt(x, y, z) {
  var h = global.hub
  if (!h) return null
  for (var i = 0; i < h.machines.length; i++) { var m = h.machines[i]; if (m[0] == x && m[1] == y && m[2] == z) return 'slot' }
  var d = h.destino
  if (d[0] == x && d[1] == y && d[2] == z) return 'destino'
  return null
}

function symbolsJson(idx) {
  var parts = [{ text: '[ ', color: 'white' }]
  idx.forEach((s, i) => {
    parts.push({ text: SLOT_SYMBOLS[s][0], color: SLOT_SYMBOLS[s][1], bold: true })
    parts.push({ text: i < 2 ? ' | ' : ' ]', color: 'white' })
  })
  return JSON.stringify(parts)
}

function finalSymbols(tier) {
  if (tier != 'nada') { var s = TIER_SYMBOL[tier]; return [s, s, s] }
  var a
  do { a = [casRnd(6), casRnd(6), casRnd(6)] } while (a[0] == a[1] && a[1] == a[2])
  return a
}

function casCmd(server, c) { server.runCommandSilent(c) }

function givePrize(server, player, tier) {
  var name = player.username
  var msg
  if (tier == 'nada') {
    msg = { text: 'Nada esta vez… la casa siempre gana.', color: 'gray' }
  } else if (tier == 'comun' || tier == 'epico' || tier == 'jackpot') {
    var list = CASINO[tier].filter(p => !Item.of(p[0]).isEmpty())
    var p = casPick(list)
    casCmd(server, `give ${name} ${p[0]} ${p[1]}`)
    msg = { text: `¡Ganaste ${p[1]}x ${Item.of(p[0]).hoverName.string}!`, color: tier == 'comun' ? 'green' : 'light_purple' }
  } else {
    casCmd(server, `loot give ${name} loot ${casPick(CASINO.raro)}`)
    msg = { text: '¡Premio raro! Botín de una estructura misteriosa.', color: 'aqua' }
  }
  casCmd(server, `tellraw ${name} ${JSON.stringify([{ text: '[Casino] ', color: 'gold', bold: true }, msg])}`)
  if (tier == 'jackpot') {
    casCmd(server, `tellraw @a ${JSON.stringify([{ text: '★ JACKPOT ★ ', color: 'gold', bold: true }, { text: `${name} ganó el premio mayor en el casino`, color: 'yellow' }])}`)
    casCmd(server, 'execute as @a at @s run playsound minecraft:ui.toast.challenge_complete master @s ~ ~ ~ 1 1')
  } else if (tier != 'nada') {
    casCmd(server, `execute as ${name} at @s run playsound minecraft:entity.player.levelup master @s ~ ~ ~ 1 1.2`)
  } else {
    casCmd(server, `execute as ${name} at @s run playsound minecraft:block.note_block.bass master @s ~ ~ ~ 1 0.6`)
  }
}

function slotFrame(server, name, f, idx) {
  server.scheduleInTicks(f * 3, () => {
    casCmd(server, `title ${name} actionbar ${symbolsJson(idx)}`)
    casCmd(server, `execute as ${name} at @s run playsound minecraft:block.note_block.hat master @s ~ ~ ~ 0.6 ${1 + f * 0.05}`)
  })
}

function spinSlot(server, player) {
  var name = player.username
  var uuid = String(player.uuid)
  if (casinoSpinning[uuid]) return
  if (countItem(player, 'minecraft:emerald') < CASINO.slotCost) {
    player.setStatusMessage(Text.red(`Necesitas ${CASINO.slotCost} esmeralda para jugar`))
    return
  }
  takeItem(player, 'minecraft:emerald', CASINO.slotCost)
  casinoSpinning[uuid] = true
  var tier = pickTier()
  var result = finalSymbols(tier)
  var frames = 12
  for (var f = 0; f < frames; f++) slotFrame(server, name, f, f < frames - 1 ? [casRnd(6), casRnd(6), casRnd(6)] : result)
  server.scheduleInTicks(frames * 3 + 6, () => {
    delete casinoSpinning[uuid]
    givePrize(server, player, tier)
  })
}

function openDestino(server, player) {
  var name = player.username
  var uuid = String(player.uuid)
  if (casinoSpinning[uuid]) return
  if (countItem(player, 'minecraft:emerald') < CASINO.destinoCost) {
    player.setStatusMessage(Text.red(`El Cofre del Destino cuesta ${CASINO.destinoCost} esmeraldas`))
    return
  }
  takeItem(player, 'minecraft:emerald', CASINO.destinoCost)
  casinoSpinning[uuid] = true
  var d = global.hub.destino
  casCmd(server, `execute in minecraft:overworld run particle minecraft:enchant ${d[0] + 0.5} ${d[1] + 1} ${d[2] + 0.5} 0.4 0.6 0.4 1 120`)
  casCmd(server, `execute as ${name} at @s run playsound minecraft:block.ender_chest.open master @s ~ ~ ~ 1 0.8`)
  server.scheduleInTicks(30, () => {
    delete casinoSpinning[uuid]
    casCmd(server, `loot give ${name} loot ${casPick(CASINO.destino)}`)
    casCmd(server, `execute in minecraft:overworld run particle minecraft:totem_of_undying ${d[0] + 0.5} ${d[1] + 1} ${d[2] + 0.5} 0.3 0.5 0.3 0.3 60`)
    casCmd(server, `execute as ${name} at @s run playsound minecraft:entity.player.levelup master @s ~ ~ ~ 1 0.8`)
    casCmd(server, `tellraw ${name} ${JSON.stringify([{ text: '[Casino] ', color: 'gold', bold: true }, { text: 'El Cofre del Destino te entregó un botín.', color: 'light_purple' }])}`)
  })
}

BlockEvents.rightClicked(e => {
  var b = e.block
  if (!global.inHub(e.level, b.x, b.z)) return
  var kind = machineAt(b.x, b.y, b.z)
  if (!kind) return
  if (String(e.hand) == 'MAIN_HAND' && !e.player.isSpectator()) {
    if (kind == 'slot') spinSlot(e.server, e.player)
    else openDestino(e.server, e.player)
  }
  e.cancel()   // en KubeJS 6 cancel() termina el handler: va al final
})

// Prueba de distribución: /casino prueba <n>  (solo cuenta, no entrega nada)
ServerEvents.commandRegistry(event => {
  var { commands: Commands, arguments: Arguments } = event
  event.register(Commands.literal('casino')
    .requires(s => s.hasPermission(2))
    .then(Commands.literal('prueba').then(Commands.argument('n', Arguments.INTEGER.create(event)).executes(ctx => {
      var n = Arguments.INTEGER.getResult(ctx, 'n')
      var c = {}
      for (var i = 0; i < n; i++) { var t = pickTier(); c[t] = (c[t] || 0) + 1 }
      ctx.source.sendSystemMessage(Text.yellow(`${n} tiradas: ${JSON.stringify(c)}`))
      return 1
    })))
    .then(Commands.literal('validar').executes(ctx => {
      var server = ctx.source.server
      var missing = []
      ;['comun', 'epico', 'jackpot'].forEach(k => CASINO[k].forEach(p => { if (Item.of(p[0]).isEmpty()) missing.push(p[0]) }))
      var lootData = server.getLootData()
      var $RL = Java.loadClass('net.minecraft.resources.ResourceLocation')
      var $LootTable = Java.loadClass('net.minecraft.world.level.storage.loot.LootTable')
      CASINO.raro.concat(CASINO.destino).forEach(t => { if (lootData.getLootTable(new $RL(t)) == $LootTable.EMPTY) missing.push(t) })
      ctx.source.sendSystemMessage(missing.length ? Text.red('Faltan: ' + missing.join(', ')) : Text.green('Casino OK: todos los ítems y tablas existen'))
      return 1
    })))
})
