// priority: 90
// Núcleo del hub (spawn + casino): construcción, datos persistentes y helpers compartidos.
// El edificio lo genera scripts/gen-hub.py → kubejs/data/hardcore_hub/functions/build.mcfunction

let $Heightmap = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types')
const $AABB = Java.loadClass('net.minecraft.world.phys.AABB')
const $Enemy = Java.loadClass('net.minecraft.world.entity.monster.Enemy')
const $HubBlockPos = Java.loadClass('net.minecraft.core.BlockPos')

global.hub = false

global.hubLoad = server => {
  var s = String(server.persistentData.getString('hub'))
  global.hub = s ? JSON.parse(s) : false
  return global.hub
}

global.hubSave = (server, data) => {
  server.persistentData.putString('hub', JSON.stringify(data))
  global.hub = data
}

// ¿(x, z) está dentro de la zona segura? Solo existe en el Overworld.
global.inHub = (level, x, z) => {
  var h = global.hub
  if (!h || !level) return false
  if (String(level.dimension) != 'minecraft:overworld') return false
  return x >= h.minX && x < h.maxX + 1 && z >= h.minZ && z < h.maxZ + 1
}

global.hubBox = () => {
  var h = global.hub
  return new $AABB(h.minX, -64, h.minZ, h.maxX + 1, 320, h.maxZ + 1)
}

global.isHubAdmin = p => p != null && p.isCreative() && p.hasPermissions(2)

global.hubSpawn = () => {
  var h = global.hub
  return h ? h.spawn : false
}

// Origen: el indicado, o el del hub ya construido (para reparar en el mismo lugar), o el spawn del mundo.
function hubBuild(server, at) {
  var level = server.overworld()
  var x, y, z
  if (at) { x = at[0]; y = at[1]; z = at[2] }
  else if (global.hub) { x = global.hub.origin[0]; y = global.hub.origin[1]; z = global.hub.origin[2] }
  else {
    var sp = level.getSharedSpawnPos()
    x = sp.x; z = sp.z
    y = level.getHeight($Heightmap.MOTION_BLOCKING_NO_LEAVES, x, z) - 1
  }
  var L = global.HUB_LAYOUT
  // Los comandos solo colocan bloques en chunks cargados: forzar la carga de toda la obra, esperar y construir
  var b = L.bounds
  var area = `${x + b.minX} ${z + b.minZ} ${x + b.maxX} ${z + b.maxZ}`
  server.runCommandSilent(`execute in minecraft:overworld run forceload add ${area}`)
  server.scheduleInTicks(60, () => {
    server.runCommandSilent(`execute in minecraft:overworld positioned ${x} ${y} ${z} run function hardcore_hub:build`)
    server.runCommandSilent(`execute in minecraft:overworld run forceload remove ${area}`)
    console.info(`Hub: obra terminada en ${x} ${y} ${z}`)
    server.runCommandSilent(`tellraw @a[gamemode=creative] {"text":"Hub construido en ${x} ${y} ${z}","color":"green"}`)
  })
  server.runCommandSilent('gamerule spawnRadius 0')
  var abs = p => [x + p[0], y + p[1], z + p[2]]
  global.hubSave(server, {
    origin: [x, y, z],
    minX: x + L.zone.minX, maxX: x + L.zone.maxX,
    minZ: z + L.zone.minZ, maxZ: z + L.zone.maxZ,
    machines: L.machines.map(abs),
    destino: abs(L.destino),
    spawn: abs(L.spawn)
  })
  return global.hub
}

ServerEvents.loaded(e => global.hubLoad(e.server))
// /reload reinicia los scripts: recargar los datos del hub enseguida si el server ya está corriendo
if (Utils.server) global.hubLoad(Utils.server)

ServerEvents.commandRegistry(event => {
  var Commands = event.commands
  var Arguments = event.arguments
  event.register(Commands.literal('hub')
    .requires(s => s.hasPermission(2))
    .then(Commands.literal('construir').executes(ctx => {
      var h = hubBuild(ctx.source.server)
      ctx.source.sendSystemMessage(Text.green(`Construyendo hub en ${h.origin.join(' ')} (listo en 3 s); spawn en ${h.spawn.join(' ')}`))
      return 1
    }))
    .then(Commands.literal('construir_en').then(Commands.argument('pos', Arguments.BLOCK_POS.create(event)).executes(ctx => {
      var bp = Arguments.BLOCK_POS.getResult(ctx, 'pos')
      var h = hubBuild(ctx.source.server, [bp.x, bp.y, bp.z])
      ctx.source.sendSystemMessage(Text.green(`Construyendo hub en ${h.origin.join(' ')} (listo en 3 s); spawn en ${h.spawn.join(' ')}`))
      return 1
    })))
    .then(Commands.literal('diag').executes(ctx => { try {
      var src = ctx.source
      var lvl = src.level
      var p = src.position
      var h = global.hub
      var ents = []
      lvl.getEntities(null, global.hubBox()).forEach(en => { if (String(en.type).indexOf('item') < 0 && String(en.type).indexOf('marker') < 0) ents.push(String(en.type) + ' monster=' + en.monster + ' enemy=' + (en instanceof $Enemy)) })
      src.sendSystemMessage(Text.yellow('dim=' + String(lvl.dimension) + ' hubType=' + typeof h + ' minX=' + h.minX + ' inHub(pos)=' + global.inHub(lvl, p.x(), p.z()) + ' ents=' + ents.slice(0, 8).join('; ')))
      } catch (err) { ctx.source.sendSystemMessage(Text.red('diag error: ' + err)) }
      return 1
    }))
    // Mapa de alturas (Overworld) para elegir dónde construir: /hub altura <x> <z> <radio> <paso> → kubejs/exported/alturas.json
    .then(Commands.literal('altura').then(Commands.argument('x', Arguments.INTEGER.create(event)).then(Commands.argument('z', Arguments.INTEGER.create(event))
      .then(Commands.argument('radio', Arguments.INTEGER.create(event)).then(Commands.argument('paso', Arguments.INTEGER.create(event)).executes(ctx => {
        try {
        var cx = Arguments.INTEGER.getResult(ctx, 'x'), cz = Arguments.INTEGER.getResult(ctx, 'z')
        var r = Arguments.INTEGER.getResult(ctx, 'radio'), st = Arguments.INTEGER.getResult(ctx, 'paso')
        var level = ctx.source.server.overworld()
        var rows = [], brows = [], biomes = []
        for (var z = cz - r; z <= cz + r; z += st) {
          var row = [], brow = []
          for (var x = cx - r; x <= cx + r; x += st) {
            var y = level.getChunk(x >> 4, z >> 4).getHeight($Heightmap.MOTION_BLOCKING_NO_LEAVES, x & 15, z & 15)
            row.push(y)
            var bid = String(level.getBiome(new $HubBlockPos(x, y, z)).unwrapKey().get().location())
            var bi = biomes.indexOf(bid)
            if (bi < 0) { biomes.push(bid); bi = biomes.length - 1 }
            brow.push(bi)
          }
          rows.push(row.join(',')); brows.push(brow.join(','))
        }
        JsonIO.write('kubejs/exported/alturas.json', { x0: cx - r, z0: cz - r, paso: st, filas: rows, biomas: biomes, filas_bioma: brows })
        ctx.source.sendSystemMessage(Text.green(`Alturas: ${rows.length} filas → kubejs/exported/alturas.json`))
        } catch (err) { ctx.source.sendSystemMessage(Text.red('altura error: ' + err)) }
        return 1
      }))))))
    // Bloques de superficie (vista aérea): /hub volcar <x> <z> <radio> → kubejs/exported/superficie.json
    .then(Commands.literal('volcar').then(Commands.argument('x', Arguments.INTEGER.create(event)).then(Commands.argument('z', Arguments.INTEGER.create(event))
      .then(Commands.argument('radio', Arguments.INTEGER.create(event)).executes(ctx => {
        try {
        var cx = Arguments.INTEGER.getResult(ctx, 'x'), cz = Arguments.INTEGER.getResult(ctx, 'z'), r = Arguments.INTEGER.getResult(ctx, 'radio')
        var level = ctx.source.server.overworld()
        var hs = [], ids = [], pal = []
        for (var z = cz - r; z <= cz + r; z++) {
          var hrow = [], irow = []
          for (var x = cx - r; x <= cx + r; x++) {
            var y = level.getChunk(x >> 4, z >> 4).getHeight($Heightmap.WORLD_SURFACE, x & 15, z & 15)
            var id = String(level.getBlock(x, y, z).id)
            var k = pal.indexOf(id)
            if (k < 0) { pal.push(id); k = pal.length - 1 }
            hrow.push(y); irow.push(k)
          }
          hs.push(hrow.join(',')); ids.push(irow.join(','))
        }
        JsonIO.write('kubejs/exported/superficie.json', { x0: cx - r, z0: cz - r, alturas: hs, bloques: ids, paleta: pal })
        ctx.source.sendSystemMessage(Text.green(`Superficie: ${hs.length}x${hs.length} → kubejs/exported/superficie.json`))
        } catch (err) { ctx.source.sendSystemMessage(Text.red('volcar error: ' + err)) }
        return 1
      })))))
    .then(Commands.literal('info').executes(ctx => {
      var h = global.hubLoad(ctx.source.server)
      ctx.source.sendSystemMessage(h
        ? Text.yellow(`Hub: origen ${h.origin.join(' ')} | zona x ${h.minX}..${h.maxX}, z ${h.minZ}..${h.maxZ} | spawn ${h.spawn.join(' ')} | ${h.machines.length / 2} tragamonedas`)
        : Text.red('No hay hub construido. Usa /hub construir'))
      return 1
    })))
})
