// Cofre de Suministros: premio por mantenerse todos vivos.
// - Cuenta el tiempo de juego solo mientras haya alguien conectado y NADIE conectado esté muerto (espectador).
//   Cada 45–75 min de ese tiempo aparece un cofre dentro de una estructura (junto a un spawner si tiene), lejos de los vivos.
// - El loot depende de la dificultad del mundo (progression.js): más dificultad → mejor tier (totems, armaduras
//   encantadas, libros, netherite…). Las estructuras también se ponen más peligrosas con el tier.
// - Coordenadas en el chat y en una bossbar. Dura 30 min; si alguien lo vacía se anuncia y termina.
// Admin (consola): /suministros forzar [tier] | /suministros estado | /suministros cancelar
// Nota Rhino: dentro de funciones se usa `var`.

const SUM_MIN = 45 * 60 * 20
const SUM_MAX = 75 * 60 * 20
const SUM_DURATION = 30 * 60 * 20
const SUM_BAR = 'suministros:cofre'

// Tiers por dificultad (mismos pisos que las fases)
const SUM_TIERS = [
  { min: 0, name: 'común', color: 'white' },
  { min: 10, name: 'poco común', color: 'green' },
  { min: 30, name: 'raro', color: 'aqua' },
  { min: 60, name: 'épico', color: 'light_purple' },
  { min: 100, name: 'legendario', color: 'gold' }
]
// Estructuras "suaves" para los primeros tiers; desde el tier 2 cualquiera de las peligrosas del Cofre del Alma
const SUM_FACILES = {
  'betterdungeons:skeleton_dungeon': 'una mazmorra de esqueletos', 'betterdungeons:zombie_dungeon': 'una mazmorra de zombis',
  'betterdungeons:spider_dungeon': 'una mazmorra de arañas', 'nova_structures:undead_crypt': 'una cripta de no-muertos',
  'explorify:mausoleum': 'un mausoleo', 'minecraft:pillager_outpost': 'un puesto de saqueadores'
}

// --- Ítems ---
function sumEnch(list) { return list.map(e => `{id:"minecraft:${e[0]}",lvl:${e[1]}s}`).join(',') }
function sumIt(id, n, ench) { return { id: 'minecraft:' + id, n: n || 1, tag: ench ? `{Enchantments:[${sumEnch(ench)}]}` : null } }
function sumBook(ench) { return { id: 'minecraft:enchanted_book', n: 1, tag: `{StoredEnchantments:[${sumEnch(ench)}]}` } }
function sumPick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function sumArmor(mat, ench) { return sumIt(mat + '_' + sumPick(['helmet', 'chestplate', 'leggings', 'boots']), 1, ench) }

// Cada tier: fijos + tiradas sobre un pool con pesos [peso, () => ítem]
const SUM_LOOT = [
  { fijos: () => [sumIt('golden_apple', 2), sumIt('bread', 12)], tiradas: 4, pool: [
    [4, () => sumArmor('iron', [['protection', 1]])],
    [2, () => sumIt('iron_sword', 1, [['sharpness', 1]])],
    [2, () => sumIt('iron_pickaxe', 1, [['efficiency', 2]])],
    [2, () => sumIt('shield')],
    [3, () => sumBook([[sumPick(['protection', 'sharpness', 'efficiency', 'unbreaking', 'feather_falling', 'power']), 2]])],
    [2, () => sumIt('ender_pearl', 2)],
    [2, () => sumIt('arrow', 24)],
    [2, () => sumIt('experience_bottle', 8)],
    [1, () => sumIt('diamond', 2)]
  ] },
  { fijos: () => [sumIt('golden_apple', 3), sumIt('cooked_beef', 16)], tiradas: 5, pool: [
    [3, () => sumArmor('iron', [['protection', 3], ['unbreaking', 2]])],
    [3, () => sumArmor('diamond', [['protection', 2]])],
    [2, () => sumIt('diamond_sword', 1, [['sharpness', 2]])],
    [2, () => sumIt('bow', 1, [['power', 3], ['unbreaking', 2]])],
    [1, () => sumIt('crossbow', 1, [['quick_charge', 2], ['piercing', 2]])],
    [3, () => sumBook([[sumPick(['protection', 'sharpness', 'efficiency', 'unbreaking', 'feather_falling', 'power', 'fire_protection', 'projectile_protection']), 3]])],
    [1, () => sumIt('totem_of_undying')],
    [2, () => sumIt('ender_pearl', 4)],
    [2, () => sumIt('experience_bottle', 16)],
    [2, () => sumIt('diamond', 3)]
  ] },
  { fijos: () => [sumIt('totem_of_undying'), sumIt('golden_apple', 4)], tiradas: 6, pool: [
    [4, () => sumArmor('diamond', [['protection', 3], ['unbreaking', 2]])],
    [2, () => sumIt('diamond_sword', 1, [['sharpness', 4], ['unbreaking', 2]])],
    [2, () => sumIt('diamond_pickaxe', 1, [['efficiency', 4], ['unbreaking', 3]])],
    [2, () => sumIt('bow', 1, [['power', 4], ['unbreaking', 3], ['flame', 1]])],
    [4, () => sumBook([[sumPick(['protection', 'sharpness', 'efficiency', 'feather_falling', 'power', 'blast_protection']), 4]])],
    [1, () => sumBook([['mending', 1]])],
    [1, () => sumIt('enchanted_golden_apple')],
    [1, () => sumIt('totem_of_undying')],
    [2, () => sumIt('netherite_scrap', 2)],
    [2, () => sumIt('experience_bottle', 24)]
  ] },
  { fijos: () => [sumIt('totem_of_undying'), sumIt('enchanted_golden_apple'), sumIt('golden_apple', 4)], tiradas: 7, pool: [
    [4, () => sumArmor('diamond', [['protection', 4], ['unbreaking', 3]])],
    [2, () => sumIt('diamond_sword', 1, [['sharpness', 5], ['unbreaking', 3], ['looting', 2]])],
    [2, () => sumIt('diamond_pickaxe', 1, [['efficiency', 5], ['unbreaking', 3], ['fortune', 2]])],
    [3, () => sumBook([[sumPick(['protection', 'sharpness', 'power']), sumPick([4, 5])]])],
    [2, () => sumBook([['mending', 1]])],
    [2, () => sumBook([['unbreaking', 3]])],
    [2, () => sumIt('totem_of_undying')],
    [2, () => sumIt('netherite_ingot')],
    [1, () => sumIt('netherite_upgrade_smithing_template')],
    [2, () => sumIt('experience_bottle', 32)]
  ] },
  { fijos: () => [sumIt('totem_of_undying', 2), sumIt('enchanted_golden_apple', 2), sumIt('netherite_upgrade_smithing_template')], tiradas: 8, pool: [
    [4, () => sumArmor('netherite', [['protection', 4], ['unbreaking', 3], ['mending', 1]])],
    [2, () => sumIt('netherite_sword', 1, [['sharpness', 5], ['unbreaking', 3], ['looting', 3], ['mending', 1]])],
    [2, () => sumIt('netherite_pickaxe', 1, [['efficiency', 5], ['unbreaking', 3], ['fortune', 3], ['mending', 1]])],
    [2, () => sumIt('bow', 1, [['power', 5], ['unbreaking', 3], ['infinity', 1], ['flame', 1]])],
    [2, () => sumBook([['mending', 1]])],
    [2, () => sumBook([[sumPick(['protection', 'sharpness', 'feather_falling', 'power']), sumPick([4, 5])]])],
    [3, () => sumIt('totem_of_undying')],
    [2, () => sumIt('netherite_ingot', 2)],
    [1, () => sumIt('enchanted_golden_apple')],
    [2, () => sumIt('experience_bottle', 64)]
  ] }
]

function sumRoll(pool) {
  var total = 0
  pool.forEach(e => { total += e[0] })
  var r = Math.random() * total
  for (var i = 0; i < pool.length; i++) { r -= pool[i][0]; if (r < 0) return pool[i][1]() }
  return pool[pool.length - 1][1]()
}

function sumItemsNbt(tier) {
  var t = SUM_LOOT[tier]
  var items = t.fijos()
  for (var i = 0; i < t.tiradas; i++) items.push(sumRoll(t.pool))
  var slots = []
  for (var s = 0; s < 27; s++) slots.push(s)
  return items.slice(0, 27).map(it => {
    var slot = slots.splice(Math.floor(Math.random() * slots.length), 1)[0]
    return `{Slot:${slot}b,id:"${it.id}",Count:${it.n}b${it.tag ? ',tag:' + it.tag : ''}}`
  }).join(',')
}

// --- Estado ---
function sumState(server) {
  var s = String(server.persistentData.getString('suministros'))
  var st = s ? JSON.parse(s) : {}
  if (!st.play) st.play = 0
  if (!st.next) st.next = 0
  if (!st.active) st.active = false
  return st
}
function sumSave(server, st) { server.persistentData.putString('suministros', JSON.stringify(st)) }
function sumCmd(server, c) { server.runCommandSilent(c) }
function sumNow(server) { return Number(server.overworld().getLevelData().getGameTime()) }
function sumRand(a, b) { return a + Math.floor(Math.random() * (b - a)) }
function sumTell(server, parts) { sumCmd(server, `tellraw @a ${JSON.stringify([{ text: '[Suministros] ', color: 'gold', bold: true }].concat(parts))}`) }

function sumTierActual(server) {
  var d = global.progDificultad ? global.progDificultad(server) : 0
  var t = 0
  for (var i = 0; i < SUM_TIERS.length; i++) if (d >= SUM_TIERS[i].min) t = i
  return t
}

// Busca una estructura (más peligrosa cuanto más alto el tier) y un hueco para el cofre
function sumBuscarSitio(server, tier) {
  var level = server.overworld()
  var c = global.almaCenter(server)
  var lista = tier >= 2 ? global.almaEstructuras : SUM_FACILES
  var ids = Object.keys(lista)
  var dMin = 300 + tier * 150, dMax = 1000 + tier * 300
  for (var j = 0; j < 8; j++) {
    var id = ids[Math.floor(Math.random() * ids.length)]
    var a = Math.random() * 6.283185307179586, d = sumRand(dMin, dMax)
    var hs = global.almaFindStructure(level, c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, id)
    if (!hs) continue
    var hx = (hs.box.minX + hs.box.maxX) / 2, hz = (hs.box.minZ + hs.box.maxZ) / 2
    var hd = Math.sqrt(Math.pow(hx - c[0], 2) + Math.pow(hz - c[1], 2))
    if (hd < dMin * 0.7 || hd > dMax * 1.5) continue
    var spot = global.almaHardSpot(level, hs)
    if (spot) return { pos: spot, where: 'en ' + (lista[id] || id) + (hs.spawners.length ? ` (${hs.spawners.length} spawners)` : '') }
  }
  var a2 = Math.random() * 6.283185307179586, d2 = sumRand(dMin, dMax)
  return { pos: global.almaBuildVault(server, Math.floor(c[0] + Math.cos(a2) * d2), Math.floor(c[1] + Math.sin(a2) * d2)), where: 'en una cámara profunda custodiada' }
}

function sumSpawn(server, tierForzado) {
  var st = sumState(server)
  if (st.active) sumFinish(server, st, 'expired')
  var tier = tierForzado >= 0 ? Math.min(SUM_TIERS.length - 1, tierForzado) : sumTierActual(server)
  var T = SUM_TIERS[tier]
  var sitio = sumBuscarSitio(server, tier)
  var p = sitio.pos
  server.overworld().getBlock(p[0], p[1], p[2]).set('minecraft:air')
  sumCmd(server, `execute in minecraft:overworld run setblock ${p[0]} ${p[1]} ${p[2]} minecraft:chest{CustomName:'${JSON.stringify({ text: 'Cofre de Suministros (' + T.name + ')', color: T.color })}',Items:[${sumItemsNbt(tier)}]}`)

  st = sumState(server)
  st.active = true
  st.pos = p
  st.tier = tier
  st.where = sitio.where
  st.end = sumNow(server) + SUM_DURATION
  sumSave(server, st)

  sumCmd(server, `bossbar remove ${SUM_BAR}`)
  sumCmd(server, `bossbar add ${SUM_BAR} ""`)
  sumCmd(server, `bossbar set ${SUM_BAR} color yellow`)
  sumCmd(server, `bossbar set ${SUM_BAR} max ${SUM_DURATION / 20}`)
  sumCmd(server, `bossbar set ${SUM_BAR} players @a`)
  sumBarUpdate(server, st)
  sumCmd(server, 'title @a times 10 80 20')
  sumCmd(server, `title @a subtitle ${JSON.stringify({ text: `${p[0]} ${p[1]} ${p[2]}`, color: 'white' })}`)
  sumCmd(server, `title @a title ${JSON.stringify({ text: 'Cofre de Suministros', color: T.color, bold: true })}`)
  sumCmd(server, 'execute as @a at @s run playsound minecraft:block.chest.open master @s ~ ~ ~ 1 0.6')
  sumTell(server, [
    { text: 'Por mantenerse todos vivos apareció un cofre ', color: 'white' },
    { text: T.name, color: T.color, bold: true },
    { text: ` ${sitio.where} en `, color: 'white' },
    { text: `X ${p[0]}  Y ${p[1]}  Z ${p[2]}`, color: 'gold', bold: true },
    { text: ` (Overworld). Desaparece en ${SUM_DURATION / 1200} min. A más dificultad, mejor botín.`, color: 'white' }
  ])
  var be = server.overworld().getBlock(p[0], p[1], p[2]).entity, lleno = []
  if (be) for (var k = 0; k < be.getContainerSize(); k++) { var it = be.getItem(k); if (!it.isEmpty()) lleno.push(String(it.id) + (it.nbt ? String(it.nbt) : '')) }
  console.info(`Suministros: tier ${tier} (${T.name}) ${sitio.where} en ${p.join(' ')} — ${lleno.length} ítems: ${lleno.join(' | ')}`)
}

function sumBarUpdate(server, st) {
  var left = Math.max(0, Math.ceil((st.end - sumNow(server)) / 20))
  var mm = Math.floor(left / 60), ss = left % 60
  var T = SUM_TIERS[st.tier || 0]
  sumCmd(server, `bossbar set ${SUM_BAR} value ${left}`)
  sumCmd(server, `bossbar set ${SUM_BAR} name ${JSON.stringify([{ text: '✦ Suministros ' + T.name + ' ', color: T.color, bold: true }, { text: `${st.pos[0]} ${st.pos[1]} ${st.pos[2]} — ${mm}:${ss < 10 ? '0' : ''}${ss}`, color: 'white' }])}`)
}

function sumFinish(server, st, reason) {
  sumCmd(server, `bossbar remove ${SUM_BAR}`)
  st.active = false
  sumSave(server, st)
  if (reason == 'expired') {
    var b = server.overworld().getBlock(st.pos[0], st.pos[1], st.pos[2])
    if (String(b.id) == 'minecraft:chest') {
      if (b.entity) b.entity.clearContent()
      b.set('minecraft:air')
    }
    sumTell(server, [{ text: 'El Cofre de Suministros se desvaneció.', color: 'gray' }])
  } else if (reason == 'looted') {
    sumTell(server, [{ text: 'Alguien vació el Cofre de Suministros.', color: 'yellow' }])
  }
}

// ¿Hay un jugador vivo a ≤ 48 bloques del cofre? (solo entonces se mira si quedó vacío, para no cargar el chunk)
function sumAlguienCerca(server, pos) {
  var cerca = false
  server.players.forEach(p => {
    if (!p.isSpectator() && String(p.level.dimension) == 'minecraft:overworld' &&
      Math.abs(p.x - pos[0]) < 48 && Math.abs(p.z - pos[2]) < 48) cerca = true
  })
  return cerca
}

let sumTicker = 0
ServerEvents.tick(e => {
  if (++sumTicker % 20 != 0) return
  var server = e.server
  var st = sumState(server)
  if (st.active) {
    if (sumNow(server) >= st.end) { sumFinish(server, st, 'expired'); return }
    if (sumAlguienCerca(server, st.pos)) {
      var b = server.overworld().getBlock(st.pos[0], st.pos[1], st.pos[2])
      if (String(b.id) != 'minecraft:chest' || (b.entity && b.entity.isEmpty())) { sumFinish(server, st, 'looted'); return }
    }
    sumBarUpdate(server, st)
    return
  }
  // Solo cuenta si hay alguien conectado y nadie conectado está muerto
  var conectados = 0, muertos = 0
  server.players.forEach(p => {
    conectados++
    if (p.isSpectator() && !p.getTags().contains('espectador_libre')) muertos++
  })
  if (!conectados || muertos) return
  st.play += 20
  if (!st.next) st.next = st.play + sumRand(SUM_MIN, SUM_MAX)
  if (st.play >= st.next) {
    st.next = st.play + sumRand(SUM_MIN, SUM_MAX)
    sumSave(server, st)
    sumSpawn(server, -1)
    return
  }
  sumSave(server, st)
})

PlayerEvents.loggedIn(e => {
  if (sumState(e.server).active) sumCmd(e.server, `bossbar set ${SUM_BAR} players @a`)
})

ServerEvents.commandRegistry(event => {
  var Commands = event.commands, Arguments = event.arguments
  event.register(Commands.literal('suministros').requires(s => s.hasPermission(2))
    .then(Commands.literal('forzar')
      .executes(ctx => { sumSpawn(ctx.source.server, -1); return 1 })
      .then(Commands.argument('tier', Arguments.INTEGER.create(event))
        .executes(ctx => { sumSpawn(ctx.source.server, Arguments.INTEGER.getResult(ctx, 'tier')); return 1 })))
    .then(Commands.literal('cancelar').executes(ctx => {
      var st = sumState(ctx.source.server)
      if (st.active) sumFinish(ctx.source.server, st, 'expired')
      return 1
    }))
    .then(Commands.literal('estado').executes(ctx => {
      var server = ctx.source.server, st = sumState(server)
      var t = sumTierActual(server)
      ctx.source.sendSystemMessage(Text.yellow(`Dificultad ${global.progDificultad(server)} → tier ${t} (${SUM_TIERS[t].name}) | cofre activo: ${st.active ? st.pos.join(' ') + ' ' + st.where + ' tier ' + st.tier + ' (' + Math.ceil((st.end - sumNow(server)) / 20) + ' s)' : 'no'} | próximo en: ${st.next ? Math.max(0, Math.ceil((st.next - st.play) / 1200)) + ' min de juego con todos vivos' : '-'}`))
      return 1
    })))
})
