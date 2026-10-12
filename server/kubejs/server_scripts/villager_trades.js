// Aldeanos sin intercambios fáciles: se borran las compras de "material barato → esmeralda" (palos, trigo, papel, carbón…).
// Se filtra al hacer clic derecho en el aldeano (antes de que abra el menú), así aplica también a los que ya existían
// y a los intercambios que desbloquean al subir de nivel. Los que venden cosas por esmeraldas no se tocan.
// Nota Rhino: dentro de funciones se usa `var`.

const TRADES_FACILES = [
  'minecraft:stick', 'minecraft:wheat', 'minecraft:potato', 'minecraft:carrot', 'minecraft:beetroot', 'minecraft:pumpkin',
  'minecraft:melon', 'minecraft:sweet_berries', 'minecraft:dried_kelp_block', 'minecraft:string', 'minecraft:coal',
  'minecraft:rotten_flesh', 'minecraft:paper', 'minecraft:clay_ball', 'minecraft:flint', 'minecraft:feather',
  'minecraft:chicken', 'minecraft:porkchop', 'minecraft:rabbit', 'minecraft:mutton', 'minecraft:beef', 'minecraft:cod',
  'minecraft:salmon', 'minecraft:leather', 'minecraft:glass_pane', 'minecraft:stone', 'minecraft:book',
  'minecraft:white_wool', 'minecraft:brown_wool', 'minecraft:black_wool', 'minecraft:gray_wool'
]

function tradesFiltrar(villager) {
  var offers = villager.getOffers()
  var quitados = 0
  var it = offers.iterator()
  while (it.hasNext()) {
    var o = it.next()
    if (String(o.getResult().id) != 'minecraft:emerald') continue
    if (TRADES_FACILES.indexOf(String(o.getCostA().id)) >= 0) { it.remove(); quitados++ }
  }
  return quitados
}

ItemEvents.entityInteracted(e => {
  var t = e.target
  if (!t || String(t.type) != 'minecraft:villager') return
  var n = tradesFiltrar(t)
  if (n) console.info(`Aldeanos: ${n} intercambios fáciles quitados a un aldeano en ${Math.floor(t.x)} ${Math.floor(t.y)} ${Math.floor(t.z)}`)
})
