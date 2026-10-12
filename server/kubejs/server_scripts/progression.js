// Progresión por fases: el mundo empieza como Minecraft vanilla y se endurece a medida que el grupo avanza.
// La fase solo sube (nunca baja) y es global: basta con que UN jugador cumpla el hito.
//   0 Vanilla    inicio                      → solo mobs vanilla por el mundo (los spawners de mazmorras sí sueltan mobs de mods), sin Champions, sin Eventos del Caos, sin lunas de sangre
//   1 Despertar  primer diamante             → Mowzie's (sin Frostmaw), Born in Chaos "ligeros", eventos del caos suaves
//   2 Infierno   entrar al Nether            → casi todo Born in Chaos, Cataclysm natural, Champions, lunas de sangre, todos los eventos
//   3 Ojo        seguir un Ojo de Ender o matar al Wither → élites de Born in Chaos y Frostmaw
//   4 Más allá   matar al Ender Dragon       → dificultad máxima de base
// La dificultad de Improved Mobs la maneja este script (en su config el crecimiento automático está en 0):
//   dificultad = piso de la fase + extra (sube con el tiempo jugado según la fase + bono por cada jefe derrotado la 1.ª vez)
// Admin (consola): /fase · /fase set <n> · /fase extra <n>
// Rhino: dentro de funciones se usa `var`. Nunca poner código después de e.cancel().

const PROG_FASES = [
  { name: 'Vanilla', color: 'green', piso: 0, tiempo: 0, meta: 'Consigue el primer diamante' },
  { name: 'Despertar', color: 'yellow', piso: 10, tiempo: 0.5, meta: 'Entra al Nether' },
  { name: 'Infierno', color: 'red', piso: 30, tiempo: 1, meta: 'Sigue un Ojo de Ender hasta la fortaleza o mata al Wither' },
  { name: 'Ojo del Fin', color: 'dark_purple', piso: 60, tiempo: 1.5, meta: 'Mata al Ender Dragon' },
  { name: 'Más allá', color: 'dark_red', piso: 100, tiempo: 2, meta: '—' }
]
const PROG_DESC = [
  'Minecraft como siempre.',
  'Despiertan criaturas nuevas en los bosques y las noches. Empiezan los Eventos del Caos.',
  'El mundo se oscurece: Born in Chaos, Cataclysm, Champions y lunas de sangre.',
  'Los horrores más grandes salen a cazar.',
  'Ya no hay vuelta atrás.'
]
// Hitos (logros vanilla) → fase mínima
const PROG_HITOS = {
  'minecraft:story/mine_diamond': 1,
  'minecraft:story/enter_the_nether': 2,
  'minecraft:story/follow_ender_eye': 3,
  'minecraft:end/kill_dragon': 4
}
// Bono de dificultad por jefe (solo la primera vez que muere cada uno)
const PROG_JEFES = {
  'minecraft:elder_guardian': 5, 'minecraft:warden': 10, 'minecraft:wither': 15, 'minecraft:ender_dragon': 20,
  'cataclysm:ignis': 15, 'cataclysm:netherite_monstrosity': 15, 'cataclysm:ender_guardian': 12, 'cataclysm:the_harbinger': 15,
  'cataclysm:the_leviathan': 15, 'cataclysm:ancient_remnant': 12, 'cataclysm:maledictus': 15, 'cataclysm:scylla': 15,
  'mowziesmobs:frostmaw': 8, 'mowziesmobs:ferrous_wroughtnaut': 8, 'mowziesmobs:umvuthi': 8, 'mowziesmobs:sculptor': 8
}
const PROG_TIEMPO_CADA = 20 * 60 * 20   // cada 20 min con alguien vivo conectado sube el "extra" según la fase
const PROG_MAX = 250

// Born in Chaos: fase desde la que aparece cada mob (los que no están listados: fase 2)
const PROG_BIC_LIGEROS = ['baby_skeleton', 'baby_spider', 'barrel_zombie', 'bloody_gadfly', 'corpse_fly', 'decrepit_skeleton',
  'zombie_fisherman', 'zombie_lumberjack', 'thornshell_crab', 'firelight', 'bone_imp', 'mr_pumpkin', 'mrs_pumpkin',
  'pumpkin_dunce', 'swarmer', 'maggot', 'glutton_fish', 'pumpkin_spirit']
const PROG_BIC_ELITES = ['nightmare_stalker', 'dread_hound', 'dire_hound_leader', 'fallen_chaos_knight', 'lifestealer',
  'lifestealer_true_form', 'supreme_bonescaller', 'krampus', 'krampus_henchman', 'sir_pumpkinhead', 'sir_pumpkinhead_without_horse',
  'lord_pumpkinhead', 'lord_pumpkinhead_withouta_horse', 'spiritof_chaos', 'missioner', 'missionary_raider', 'scarlet_persecutor',
  'sir_the_headless', 'mother_spider', 'skeleton_demoman']
// Spawns "salvajes" (no de estructuras ni spawners): los únicos que se filtran
const PROG_SPAWN_SALVAJE = ['NATURAL', 'CHUNK_GENERATION', 'PATROL', 'REINFORCEMENT', 'EVENT', 'JOCKEY']

function progState(server) {
  var s = String(server.persistentData.getString('progresion'))
  var st = s ? JSON.parse(s) : {}
  if (!st.fase) st.fase = 0
  if (!st.extra) st.extra = 0
  if (!st.jefes) st.jefes = []
  if (!st.next) st.next = 0
  return st
}
function progSave(server, st) { server.persistentData.putString('progresion', JSON.stringify(st)); global.progFaseCache = st.fase }
function progDiff(st) { return Math.min(PROG_MAX, Math.round((PROG_FASES[st.fase].piso + st.extra) * 10) / 10) }
function progApplyDiff(server, st) { server.runCommandSilent(`improvedmobs difficulty set ${progDiff(st)}`) }
function progNow(server) { return Number(server.overworld().getLevelData().getGameTime()) }
function progTell(server, json) { server.runCommandSilent(`tellraw @a ${JSON.stringify(json)}`) }

// Dificultad actual (la usa supply_chest.js)
global.progDificultad = server => progDiff(progState(server))

// Fase actual (la usan otros scripts, p. ej. chaos_events.js)
global.progFaseCache = -1
global.progFase = server => {
  if (global.progFaseCache < 0) global.progFaseCache = progState(server).fase
  return global.progFaseCache
}

function progSetFase(server, n, motivo) {
  var st = progState(server)
  if (n <= st.fase && motivo) return
  st.fase = Math.max(0, Math.min(PROG_FASES.length - 1, n))
  progSave(server, st)
  progApplyDiff(server, st)
  if (!motivo) return
  var f = PROG_FASES[st.fase]
  server.runCommandSilent('title @a times 10 80 20')
  server.runCommandSilent(`title @a subtitle ${JSON.stringify({ text: PROG_DESC[st.fase], color: 'white' })}`)
  server.runCommandSilent(`title @a title ${JSON.stringify({ text: 'Fase ' + st.fase + ': ' + f.name, color: f.color, bold: true })}`)
  server.runCommandSilent('execute as @a at @s run playsound minecraft:entity.wither.spawn master @s ~ ~ ~ 0.6 0.8')
  progTell(server, [{ text: '[Progreso] ', color: 'dark_red', bold: true }, { text: motivo + ' ', color: 'gray' },
    { text: 'Fase ' + st.fase + ': ' + f.name + '. ', color: f.color, bold: true }, { text: PROG_DESC[st.fase], color: 'white' }])
  console.info(`Progresión: fase ${st.fase} (${motivo}), dificultad ${progDiff(st)}`)
}

function progInfo(st) {
  var f = PROG_FASES[st.fase]
  return [{ text: 'Fase ' + st.fase + ': ' + f.name, color: f.color, bold: true },
    { text: ` · dificultad ${progDiff(st)} · siguiente: ${f.meta}`, color: 'gray' }]
}

// Hitos por logros
PlayerEvents.advancement(e => {
  var id = String(e.advancement.id())
  var n = PROG_HITOS[id]
  if (n === undefined) return
  progSetFase(e.server, n, `${e.player.username} consiguió "${String(e.advancement.displayText.string).replace(/[\[\]]/g, '')}".`)
})

// Jefes: bono de dificultad la primera vez; el Wither también abre la fase 3
EntityEvents.death(e => {
  var id = String(e.entity.type)
  var bono = PROG_JEFES[id]
  if (bono === undefined) return
  var server = e.server
  var st = progState(server)
  if (st.jefes.indexOf(id) < 0) {
    st.jefes.push(id)
    st.extra += bono
    progSave(server, st)
    progApplyDiff(server, st)
    progTell(server, [{ text: '[Progreso] ', color: 'dark_red', bold: true },
      { text: `Cayó ${e.entity.name.string} por primera vez. La dificultad sube a ${progDiff(st)}.`, color: 'gold' }])
  }
  if (id == 'minecraft:wither') progSetFase(server, 3, 'El Wither fue derrotado.')
})

// Mobs de mods bloqueados por fase SOLO cuando aparecen solos por el mundo. Los de spawners y estructuras (mazmorras,
// criptas…) siempre salen: checkSpawn los marca con PROG_TAG_OK y esa marca se guarda con el mob.
// Born in Chaos además se filtra en spawned (por defecto se cancela lo que no venga marcado), porque algunos de sus mobs
// aparecen por caminos propios del mod sin pasar por checkSpawn. Aliados "controlled" y variantes "_not_despawn"
// (las de estructuras) siempre se permiten.
const PROG_TAG_OK = 'prog_estructura'
const PROG_SPAWN_ESTRUCTURA = ['SPAWNER', 'STRUCTURE', 'TRIAL_SPAWNER']

function progBicFase(id) {
  var base = id.substring(id.indexOf(':') + 1)
  if (base.indexOf('controlled') >= 0 || base.endsWith('_not_despawn')) return 0
  base = base.replace(/_copy$/, '')
  if (PROG_BIC_LIGEROS.indexOf(base) >= 0) return 1
  if (PROG_BIC_ELITES.indexOf(base) >= 0) return 3
  return 2
}
// Fase desde la que un mob de mod puede aparecer solo por el mundo (0 = siempre / no es de un mod filtrado)
function progModFase(id) {
  if (id.startsWith('born_in_chaos_v1:')) return progBicFase(id)
  if (id.startsWith('cataclysm:')) return 2
  if (id.startsWith('mowziesmobs:')) return id == 'mowziesmobs:frostmaw' ? 3 : 1
  return 0
}

EntityEvents.checkSpawn(e => {
  var m = e.entity
  var id = String(m.type)
  var desde = progModFase(id)
  if (desde == 0) return
  var tipo = String(e.type)
  if (PROG_SPAWN_ESTRUCTURA.indexOf(tipo) >= 0) { m.addTag(PROG_TAG_OK); return }
  if (PROG_SPAWN_SALVAJE.indexOf(tipo) < 0) return
  if (global.progFase(e.server) >= desde) return
  e.cancel()
})

EntityEvents.spawned(e => {
  var m = e.entity
  if (!m.living || m.player) return
  var server = e.server
  var fase = global.progFase(server)
  if (fase >= 3) return
  // Champions desde la fase 2: antes se les quita el rango (se asigna al aparecer, por eso 1 tick después)
  if (fase < 2 && m.monster) {
    var uuid = String(m.uuid)
    server.scheduleInTicks(1, () => server.runCommandSilent(`champions remove ${uuid}`))
  }
  var id = String(m.type)
  if (!id.startsWith('born_in_chaos_v1:') || progBicFase(id) <= fase || m.getTags().contains(PROG_TAG_OK)) return
  e.cancel()
})

// Cada segundo: lunas de Enhanced Celestials (sin eventos lunares antes de la fase 2) y crecimiento por tiempo
let progTicker = 0
ServerEvents.tick(e => {
  if (++progTicker % 20 != 0) return
  var server = e.server
  var fase = global.progFase(server)
  if (fase < 2 && progTicker % 200 == 0) {
    var tod = Number(server.overworld().getDayTime()) % 24000
    if (tod >= 11500 && tod < 23500) server.runCommandSilent('enhancedcelestials setLunarEvent enhancedcelestials:default')
  }
  var st = progState(server)
  var now = progNow(server)
  if (!st.next) { st.next = now + PROG_TIEMPO_CADA; progSave(server, st); return }
  if (now < st.next) return
  var vivos = 0
  server.players.forEach(p => { if (!p.isSpectator()) vivos++ })
  st.next = now + PROG_TIEMPO_CADA
  if (vivos > 0 && PROG_FASES[st.fase].tiempo > 0) {
    st.extra = Math.round((st.extra + PROG_FASES[st.fase].tiempo) * 10) / 10
    progApplyDiff(server, st)
  }
  progSave(server, st)
})

ServerEvents.loaded(e => {
  var st = progState(e.server)
  global.progFaseCache = st.fase
  progApplyDiff(e.server, st)
})
if (Utils.server) global.progFaseCache = progState(Utils.server).fase

PlayerEvents.loggedIn(e => {
  e.server.runCommandSilent(`tellraw ${e.player.username} ${JSON.stringify([{ text: '[Progreso] ', color: 'dark_red', bold: true }].concat(progInfo(progState(e.server))))}`)
})

ServerEvents.commandRegistry(event => {
  var Commands = event.commands, Arguments = event.arguments
  event.register(Commands.literal('fase')
    .executes(ctx => {
      ctx.source.sendSystemMessage(Text.gold('[Progreso] ' + progInfo(progState(ctx.source.server)).map(p => p.text).join('')))
      return 1
    })
    .then(Commands.literal('set').requires(s => s.hasPermission(2)).then(Commands.argument('n', Arguments.INTEGER.create(event)).executes(ctx => {
      var server = ctx.source.server
      progSetFase(server, Arguments.INTEGER.getResult(ctx, 'n'), null)
      ctx.source.sendSystemMessage(Text.green(progInfo(progState(server)).map(p => p.text).join('')))
      return 1
    })))
    .then(Commands.literal('extra').requires(s => s.hasPermission(2)).then(Commands.argument('n', Arguments.INTEGER.create(event)).executes(ctx => {
      var server = ctx.source.server
      var st = progState(server)
      st.extra = Arguments.INTEGER.getResult(ctx, 'n')
      progSave(server, st)
      progApplyDiff(server, st)
      ctx.source.sendSystemMessage(Text.green(progInfo(st).map(p => p.text).join('')))
      return 1
    }))))
})
