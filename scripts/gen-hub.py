#!/usr/bin/env python3
"""Genera la función hardcore_hub:build (spawn + casino) en server/kubejs/data/ (KubeJS la carga como datapack).
Coordenadas relativas al origen = centro de la plaza a nivel del suelo (el piso es y=0, los jugadores pisan y=1).
La ejecuta el comando /hub construir (kubejs/server_scripts/hub_core.js).
El layout (zona segura, máquinas, cofre) también se exporta a kubejs/server_scripts/hub_layout.js para que coincidan.
Uso: python3 scripts/gen-hub.py"""
import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "server/kubejs/data/hardcore_hub/functions/build.mcfunction")
LAYOUT_JS = os.path.join(ROOT, "server/kubejs/server_scripts/hub_layout.js")

# --- Geometría ---
PLAZA = 15                      # plaza: x,z en [-15, 15]
CX0, CX1, CZ0, CZ1 = 17, 39, -10, 10   # casino (paredes exteriores)
WALL_H = 6
MARGIN = 8
ZONE = dict(minX=-PLAZA - MARGIN, maxX=CX1 + MARGIN, minZ=-PLAZA - MARGIN, maxZ=PLAZA + MARGIN)
MACHINE_X = [21, 25, 29]        # tragamonedas en la pared norte (z=CZ0+1) y sur (z=CZ1-1)
DESTINO = (37, 2, 0)            # Cofre del Destino (ender chest sobre pedestal)
SPAWN = (0, 1, 6)               # punto de aparición (al sur de la fuente)

cmds = []
def fill(x0, y0, z0, x1, y1, z1, block, mode=""):
    # divide en bloques de <= 32768 para respetar el límite de /fill
    xs = sorted((x0, x1)); ys = sorted((y0, y1)); zs = sorted((z0, z1))
    area = (xs[1] - xs[0] + 1) * (zs[1] - zs[0] + 1)
    step = max(1, 32768 // area)
    y = ys[0]
    while y <= ys[1]:
        ye = min(ys[1], y + step - 1)
        cmds.append(f"fill ~{xs[0]} ~{y} ~{zs[0]} ~{xs[1]} ~{ye} ~{zs[1]} {block}{(' ' + mode) if mode else ''}")
        y = ye + 1
def setb(x, y, z, block):
    cmds.append(f"setblock ~{x} ~{y} ~{z} {block}")

def sign(x, y, z, facing, lines, color="black"):
    msgs = []
    for i in range(4):
        t = lines[i] if i < len(lines) else ""
        bold = i == 0
        msgs.append("'" + json.dumps({"text": t, "bold": bold, "color": "dark_red" if bold else color}, ensure_ascii=False).replace("'", "\\'") + "'")
    nbt = "{front_text:{has_glowing_text:1b,messages:[" + ",".join(msgs) + "]},is_waxed:1b}"
    setb(x, y, z, f"minecraft:dark_oak_wall_sign[facing={facing}]{nbt}")

# --- 1. Terreno: limpiar arriba, rellenar abajo, césped ---
zx0, zx1, zz0, zz1 = ZONE["minX"], ZONE["maxX"], ZONE["minZ"], ZONE["maxZ"]
fill(zx0, 1, zz0, zx1, 48, zz1, "minecraft:air")
for b in ("air", "water", "lava", "cave_air"):
    fill(zx0, -14, zz0, zx1, -1, zz1, "minecraft:stone", f"replace minecraft:{b}")
fill(zx0, -3, zz0, zx1, -1, zz1, "minecraft:dirt")
fill(zx0, 0, zz0, zx1, 0, zz1, "minecraft:grass_block")

# --- 2. Plaza ---
for x in range(-PLAZA, PLAZA + 1):
    for z in range(-PLAZA, PLAZA + 1):
        r = max(abs(x), abs(z))
        if r == PLAZA: b = "stone_bricks"
        elif abs(x) <= 1 or abs(z) <= 1: b = "polished_deepslate"
        elif r == 5: b = "chiseled_stone_bricks"
        elif r < 5: b = "smooth_stone"
        elif (x + z) % 2 == 0: b = "polished_andesite"
        else: b = "andesite"
        setb(x, 0, z, "minecraft:" + b)
# murete con entradas en los 4 lados (el este conecta con el casino)
for i in range(-PLAZA, PLAZA + 1):
    for (x, z) in ((i, -PLAZA), (i, PLAZA), (-PLAZA, i), (PLAZA, i)):
        if abs(i) <= 2: continue
        setb(x, 1, z, "minecraft:mossy_stone_bricks" if (i % 2) else "minecraft:stone_bricks")
        if i % 4 == 0 and abs(i) != PLAZA:
            setb(x, 2, z, "minecraft:potted_red_tulip" if i % 8 else "minecraft:potted_azure_bluet")
# postes de luz
for (x, z) in ((-10, -10), (10, -10), (-10, 10), (10, 10), (-12, 0), (0, -12), (0, 12), (12, 4), (12, -4)):
    for y in (1, 2, 3): setb(x, y, z, "minecraft:stone_brick_wall")
    setb(x, 4, z, "minecraft:lantern")
# fuente central
for x in range(-2, 3):
    for z in range(-2, 3):
        setb(x, 0, z, "minecraft:prismarine_bricks")
        if max(abs(x), abs(z)) == 2: setb(x, 1, z, "minecraft:quartz_bricks")
        else: setb(x, 1, z, "minecraft:water")
for (x, z) in ((-1, -1), (1, -1), (-1, 1), (1, 1)): setb(x, 0, z, "minecraft:sea_lantern")
for y in (1, 2, 3): setb(0, y, 0, "minecraft:quartz_pillar")
setb(0, 4, 0, "minecraft:water")
# bancos
for sx in (-1, 1):
    for x in range(3, 7):
        setb(sx * x, 1, -8, "minecraft:stone_brick_stairs[facing=north]")
        setb(sx * x, 1, 8, "minecraft:stone_brick_stairs[facing=south]")
# tablero de reglas (lado norte)
for x in range(-5, 6):
    for y in (1, 2, 3): setb(x, y, -13, "minecraft:deepslate_tiles")
    setb(x, 4, -13, "minecraft:deepslate_tile_slab")
sign(-4, 2, -12, "south", ["REGLAS", "Hardcore real:", "si mueres quedas", "de espectador"])
sign(-2, 2, -12, "south", ["REVIVIR", "Corazón del Alma", "(sale en el chat)", "o tótem + altar"])
sign(0, 3, -12, "south", ["SPAWN", "Bienvenidos", "aquí se muere", "de verdad"])
sign(2, 2, -12, "south", ["ZONA SEGURA", "sin mobs, sin", "daño ni romper", "bloques"])
sign(4, 2, -12, "south", ["EVENTOS", "del Caos: a veces", "todo se pone", "peor por un rato"])
fill(-3, 1, 13, -1, 3, 13, "minecraft:deepslate_tiles")
sign(-2, 2, 12, "north", ["CASINO", "al este  →", "tragamonedas", "y Cofre Destino"])

# --- 3. Casino ---
# camino plaza → casino
fill(PLAZA, 0, -1, CX0 - 1, 0, 1, "minecraft:polished_deepslate")
fill(CX0, 0, CZ0, CX1, 0, CZ1, "minecraft:polished_blackstone_bricks")
fill(CX0 + 1, 0, CZ0 + 1, CX1 - 1, 0, CZ1 - 1, "minecraft:polished_blackstone")
for x in range(CX0 + 2, CX1 - 1, 4):
    fill(x, 0, CZ0 + 1, x, 0, CZ1 - 1, "minecraft:gilded_blackstone")
# paredes
fill(CX0, 1, CZ0, CX1, WALL_H, CZ1, "minecraft:quartz_bricks")
fill(CX0 + 1, 1, CZ0 + 1, CX1 - 1, WALL_H, CZ1 - 1, "minecraft:air")
for (x, z) in ((CX0, CZ0), (CX1, CZ0), (CX0, CZ1), (CX1, CZ1)):
    fill(x, 1, z, x, WALL_H, z, "minecraft:chiseled_quartz_block")
fill(CX0, WALL_H, CZ0, CX1, WALL_H, CZ0, "minecraft:gold_block")
fill(CX0, WALL_H, CZ1, CX1, WALL_H, CZ1, "minecraft:gold_block")
fill(CX1, WALL_H, CZ0, CX1, WALL_H, CZ1, "minecraft:gold_block")
# ventanas
for x0 in (20, 26, 32):
    fill(x0, 2, CZ0, x0 + 2, 4, CZ0, "minecraft:yellow_stained_glass")
    fill(x0, 2, CZ1, x0 + 2, 4, CZ1, "minecraft:yellow_stained_glass")
fill(CX1, 2, -3, CX1, 4, 3, "minecraft:yellow_stained_glass")
# techo con luces
fill(CX0, WALL_H + 1, CZ0, CX1, WALL_H + 1, CZ1, "minecraft:smooth_quartz")
for x in range(CX0 + 3, CX1 - 1, 4):
    for z in (-6, -2, 2, 6):
        setb(x, WALL_H + 1, z, "minecraft:sea_lantern")
# fachada con letrero CASINO (oro sobre negro), visible desde la plaza
FONT = {
    "C": ["###", "#..", "#..", "#..", "###"], "A": [".#.", "#.#", "###", "#.#", "#.#"],
    "S": ["###", "#..", "###", "..#", "###"], "I": ["###", ".#.", ".#.", ".#.", "###"],
    "N": ["#.#", "###", "###", "#.#", "#.#"], "O": ["###", "#.#", "#.#", "#.#", "###"],
}
fill(CX0, WALL_H + 1, -11, CX0, WALL_H + 7, 11, "minecraft:black_concrete")
z = -11
for ch in "CASINO":
    rows = FONT[ch]
    for r, row in enumerate(rows):
        for c, px in enumerate(row):
            if px == "#": setb(CX0, WALL_H + 6 - r, z + c, "minecraft:gold_block")
    z += 4
# puerta
fill(CX0, 1, -1, CX0, 3, 1, "minecraft:air")
for zz in (-2, 2):
    fill(CX0 - 1, 1, zz, CX0 - 1, 3, zz, "minecraft:gold_block")
    setb(CX0 - 1, 4, zz, "minecraft:lantern")
# alfombra
fill(CX0 + 1, 1, 0, 34, 1, 0, "minecraft:red_carpet")
# tragamonedas: cuerpo de oro, pantalla de esmeralda, palanca, faro arriba
MACHINES = []
for x in MACHINE_X:
    for (z, face, out) in ((CZ0 + 1, "south", 1), (CZ1 - 1, "north", -1)):
        setb(x, 1, z, "minecraft:gold_block")
        setb(x, 2, z, "minecraft:emerald_block")
        setb(x, 3, z, "minecraft:sea_lantern")
        setb(x - 1, 1, z, "minecraft:polished_blackstone_wall")
        setb(x + 1, 1, z, "minecraft:polished_blackstone_wall")
        setb(x, 2, z + out, f"minecraft:lever[face=wall,facing={face}]")
        MACHINES.append([x, 2, z]); MACHINES.append([x, 2, z + out])
# Cofre del Destino
dx, dy, dz = DESTINO
fill(dx - 1, 1, dz - 1, dx + 1, 1, dz + 1, "minecraft:gold_block")
setb(dx, 1, dz, "minecraft:crying_obsidian")
setb(dx, 2, dz, "minecraft:ender_chest[facing=west]")
for (x, z) in ((dx - 1, dz - 2), (dx - 1, dz + 2)):
    for y in (1, 2): setb(x, y, z, "minecraft:polished_blackstone_wall")
    setb(x, 3, z, "minecraft:soul_lantern")
# letreros de precios (pared interior oeste, mirando al este)
sign(CX0 + 1, 2, -3, "east", ["TRAGAMONEDAS", "1 esmeralda", "clic en la palanca", "o la pantalla"])
sign(CX0 + 1, 2, 3, "east", ["COFRE DESTINO", "8 esmeraldas", "loot de cualquier", "estructura"])
# plantas
for (x, z) in ((CX0 + 1, CZ0 + 1), (CX0 + 1, CZ1 - 1), (CX1 - 1, CZ0 + 1), (CX1 - 1, CZ1 - 1)):
    setb(x, 1, z, "minecraft:potted_bamboo")

cmds.append(f"setworldspawn ~{SPAWN[0]} ~{SPAWN[1]} ~{SPAWN[2]}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("# Generado por scripts/gen-hub.py — no editar a mano\n")
    f.write("\n".join(cmds) + "\n")

layout = dict(zone=ZONE, machines=MACHINES, destino=list(DESTINO), spawn=list(SPAWN))
with open(LAYOUT_JS, "w", encoding="utf-8") as f:
    f.write("// priority: 100\n// Generado por scripts/gen-hub.py — no editar a mano. Coordenadas relativas al origen del hub.\n")
    f.write("global.HUB_LAYOUT = " + json.dumps(layout) + "\n")
print(f"{OUT}: {len(cmds)} comandos; {len(MACHINES)//2} tragamonedas")
