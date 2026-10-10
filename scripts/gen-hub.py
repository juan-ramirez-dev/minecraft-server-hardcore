#!/usr/bin/env python3
"""Genera la función hardcore_hub:build (spawn + casino) en server/kubejs/data/ (KubeJS la carga como datapack).
Coordenadas relativas al origen = centro de la plaza a nivel del suelo (el piso es y=0, los jugadores pisan y=1).
La ejecuta el comando /hub construir (kubejs/server_scripts/hub_core.js).
El layout (zona segura, máquinas, cofre) también se exporta a kubejs/server_scripts/hub_layout.js para que coincidan.
Solo usa bloques vanilla y de mods que TAMBIÉN tienen los clientes (Cataclysm, Born in Chaos); nunca de mods solo-server.
Uso: python3 scripts/gen-hub.py [--preview DIR]   (--preview guarda una planta en PNG/HTML para revisar sin entrar al juego)"""
import os, sys, json, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "server/kubejs/data/hardcore_hub/functions/build.mcfunction")
LAYOUT_JS = os.path.join(ROOT, "server/kubejs/server_scripts/hub_layout.js")

# --- Paleta ---
MC = "minecraft:"
ARG = "born_in_chaos_v1:"
CAT = "cataclysm:"
B = dict(
    arg_brick=ARG + "black_argillite_brick", arg_wall=ARG + "black_argillite_brick_wall",
    arg_col=ARG + "black_argillite_column[axis=y]", lamp=ARG + "argillite_lamp",
    glass_red=ARG + "scarlet_stained_glass", glass_purple=ARG + "purple_stained_glass",
    tiles=CAT + "stone_tiles", tile_slab=CAT + "stone_tile_slab[type=bottom]", pillar=CAT + "stone_pillar[axis=y]",
    az_bricks=CAT + "azure_seastone_bricks", az_tiles=CAT + "azure_seastone_tiles", az_pillar=CAT + "azure_seastone_pillar[axis=y]",
    az_chiseled=CAT + "chiseled_azure_seastone", az_slab=CAT + "polished_azure_seastone_slab[type=bottom]",
    az_slab_top=CAT + "polished_azure_seastone_slab[type=top]",
    steel=CAT + "black_steel_block", steel_wall=CAT + "black_steel_wall", ancient=CAT + "ancient_metal_block",
    obs_bricks=CAT + "obsidian_bricks", obs_chiseled=CAT + "chiseled_obsidian_bricks", obs_polished=CAT + "polished_obsidian",
    obs_pillar=CAT + "obsidian_pillar[axis=y]",
)

# --- Geometría ---
R, CUT = 17, 25                 # plaza octogonal: max(|x|,|z|) <= R y |x|+|z| <= CUT
CX0, CX1, CZ0, CZ1 = 22, 50, -12, 12   # casino (paredes exteriores); la fachada es la pared oeste (x=CX0)
WALL_H = 7                      # paredes y=1..7, techo en y=8
FACADE_Z = CZ1                  # la fachada alta ocupa todo el frente
MARGIN = 8
ZONE = dict(minX=-R - MARGIN, maxX=CX1 + MARGIN, minZ=-max(R, CZ1) - MARGIN, maxZ=max(R, CZ1) + MARGIN)
MACHINE_X = [28, 32, 36, 40]    # tragamonedas en la pared norte (z=CZ0+1) y sur (z=CZ1-1)
DESTINO = (46, 3, 0)            # Cofre del Destino (ender chest sobre el altar)
SPAWN = (0, 1, 9)               # punto de aparición: al sur de la fuente, mirando al norte
SPAWN_ANGLE = 180

cmds = []
W = {}                          # mundo simulado para la vista previa: (x,y,z) -> bloque

def _id(block): return block if ":" in block.split("[")[0] else MC + block

def fill(x0, y0, z0, x1, y1, z1, block, mode=""):
    block = _id(block)
    xs = sorted((x0, x1)); ys = sorted((y0, y1)); zs = sorted((z0, z1))
    # divide en bloques de <= 32768 para respetar el límite de /fill
    area = (xs[1] - xs[0] + 1) * (zs[1] - zs[0] + 1)
    step = max(1, 32768 // area)
    y = ys[0]
    while y <= ys[1]:
        ye = min(ys[1], y + step - 1)
        cmds.append(f"fill ~{xs[0]} ~{y} ~{zs[0]} ~{xs[1]} ~{ye} ~{zs[1]} {block}{(' ' + mode) if mode else ''}")
        y = ye + 1
    if mode: return
    for x in range(xs[0], xs[1] + 1):
        for y in range(ys[0], ys[1] + 1):
            for z in range(zs[0], zs[1] + 1):
                if block == MC + "air": W.pop((x, y, z), None)
                else: W[(x, y, z)] = block

def setb(x, y, z, block):
    block = _id(block)
    cmds.append(f"setblock ~{x} ~{y} ~{z} {block}")
    W[(x, y, z)] = block

def _sign_nbt(lines, color):
    msgs = []
    for i in range(4):
        t = lines[i] if i < len(lines) else ""
        bold = i == 0
        msgs.append("'" + json.dumps({"text": t, "bold": bold, "color": "gold" if bold else color}, ensure_ascii=False).replace("'", "\\'") + "'")
    return "{front_text:{has_glowing_text:1b,color:\"white\",messages:[" + ",".join(msgs) + "]},is_waxed:1b}"

def sign(x, y, z, facing, lines, color="white", wood="dark_oak"):
    setb(x, y, z, f"{wood}_wall_sign[facing={facing}]" + _sign_nbt(lines, color))

def sign_post(x, y, z, rotation, lines, color="white", wood="dark_oak"):
    setb(x, y, z, f"{wood}_sign[rotation={rotation}]" + _sign_nbt(lines, color))

def in_plaza(x, z): return max(abs(x), abs(z)) <= R and abs(x) + abs(z) <= CUT
def plaza_edge(x, z):
    return in_plaza(x, z) and any(not in_plaza(x + dx, z + dz) for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)))

# ============================================================================================
# 1. Terreno: limpiar arriba, rellenar abajo, césped
zx0, zx1, zz0, zz1 = ZONE["minX"], ZONE["maxX"], ZONE["minZ"], ZONE["maxZ"]
fill(zx0, 1, zz0, zx1, 48, zz1, "air")
for b in ("air", "water", "lava", "cave_air"):
    fill(zx0, -14, zz0, zx1, -1, zz1, "stone", f"replace minecraft:{b}")
fill(zx0, -3, zz0, zx1, -1, zz1, "dirt")
fill(zx0, 0, zz0, zx1, 0, zz1, "grass_block")

# ============================================================================================
# 2. Plaza octogonal
for x in range(-R, R + 1):
    for z in range(-R, R + 1):
        if not in_plaza(x, z): continue
        d = math.hypot(x, z)
        if plaza_edge(x, z): b = B["arg_brick"]
        elif abs(x) <= 1 or abs(z) <= 1: b = "polished_deepslate"
        elif abs(x) == 2 or abs(z) == 2: b = B["tiles"]
        elif 6.5 <= d < 8.5: b = B["tiles"]
        elif 8.5 <= d < 9.5: b = "chiseled_stone_bricks" if (x + z) % 2 == 0 else "stone_bricks"
        else: b = "stone_bricks" if (x * 7 + z * 3) % 5 else "cracked_stone_bricks"
        setb(x, 0, z, b)

# murete perimetral con columnas y faroles; entradas de 5 de ancho en los 4 ejes
edge = [(x, z) for x in range(-R, R + 1) for z in range(-R, R + 1) if plaza_edge(x, z)]
for (x, z) in edge:
    if abs(x) <= 2 or abs(z) <= 2: continue
    corner = abs(x) + abs(z) in (CUT, CUT - 1) and (abs(x) == R or abs(z) == R)
    if corner or (abs(x) == R and z % 4 == 0) or (abs(z) == R and x % 4 == 0):
        for y in (1, 2, 3): setb(x, y, z, B["arg_col"])
        setb(x, 4, z, B["lamp"])
    else:
        setb(x, 1, z, B["arg_wall"])

# arcos de entrada (pilares de piedra, dintel, faroles colgantes)
def arch(axis, s):
    # axis 'z': entrada norte/sur en z = s*R ; axis 'x': entrada este/oeste en x = s*R
    for o in (-3, 3):
        p = (o, s * R) if axis == "z" else (s * R, o)
        for y in range(1, 6): setb(p[0], y, p[1], B["pillar"])
    for o in range(-3, 4):
        p = (o, s * R) if axis == "z" else (s * R, o)
        setb(p[0], 6, p[1], "chiseled_stone_bricks" if o == 0 else B["tiles"])
        if abs(o) == 3: setb(p[0], 7, p[1], B["lamp"])
    for o in (-1, 1):
        p = (o, s * R) if axis == "z" else (s * R, o)
        setb(p[0], 5, p[1], "lantern[hanging=true]")
for axis in ("x", "z"):
    for s in (-1, 1): arch(axis, s)

# jardines con cerezo en las 4 diagonales
def cherry(cx, cz):
    for x in range(cx - 2, cx + 3):
        for z in range(cz - 2, cz + 3):
            if max(abs(x - cx), abs(z - cz)) == 2: setb(x, 1, z, B["tile_slab"])
            else: setb(x, 0, z, "grass_block")
    for y in range(1, 6): setb(cx, y, cz, "cherry_log[axis=y]")
    for y, r in ((4, 2), (5, 2), (6, 1)):
        for x in range(cx - r, cx + r + 1):
            for z in range(cz - r, cz + r + 1):
                if (x, z) == (cx, cz) and y < 6: continue
                if r == 2 and abs(x - cx) == 2 and abs(z - cz) == 2: continue
                setb(x, y, z, "cherry_leaves[persistent=true]")
    for (dx, dz, f) in ((-1, -1, "allium"), (1, 1, "pink_tulip"), (-1, 1, "lily_of_the_valley"), (1, -1, "azure_bluet")):
        setb(cx + dx, 1, cz + dz, f)
    for (dx, dz) in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        setb(cx + dx, 1, cz + dz, "pink_petals[flower_amount=4,facing=north]")
for sx in (-1, 1):
    for sz in (-1, 1): cherry(sx * 11, sz * 11)

# bancos a los lados de los caminos, mirando al camino, con apoyabrazos
def bench(x, z, along, facing):
    for o in (-1, 0, 1):
        p = (x, z + o) if along == "z" else (x + o, z)
        setb(p[0], 1, p[1], f"dark_oak_stairs[facing={facing}]")
    for o in (-2, 2):
        p = (x, z + o) if along == "z" else (x + o, z)
        setb(p[0], 1, p[1], f"dark_oak_trapdoor[facing={facing},open=true,half=bottom]")
for s in (-1, 1):
    bench(-4, s * 11, "z", "west"); bench(4, s * 11, "z", "east")
    bench(s * 12, -4, "x", "north"); bench(s * 12, 4, "x", "south")

# faroles alrededor de la fuente
for (x, z) in ((5, 5), (-5, 5), (5, -5), (-5, -5)):
    for y in (1, 2, 3): setb(x, y, z, B["arg_wall"])
    setb(x, 4, z, B["lamp"])

# fuente central de piedra marina azul (Cataclysm) con cascada
def in_basin(x, z): return max(abs(x), abs(z)) <= 4 and abs(x) + abs(z) <= 6
for x in range(-4, 5):
    for z in range(-4, 5):
        if not in_basin(x, z): continue
        rim = any(not in_basin(x + dx, z + dz) for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if rim:
            setb(x, 0, z, B["az_bricks"]); setb(x, 1, z, B["az_slab"])
        else:
            setb(x, -1, z, "sea_lantern" if abs(x) == abs(z) == 2 else B["az_tiles"])
            setb(x, 0, z, "water")
for y in range(0, 4): setb(0, y, 0, B["az_pillar"])
setb(0, 4, 0, B["az_chiseled"])
for (dx, dz) in ((1, 0), (-1, 0), (0, 1), (0, -1)): setb(dx, 4, dz, B["az_slab_top"])
setb(0, 5, 0, "water")

# tablero de reglas (norte): muro con marco de pilares, murales y letreros
for x in range(-6, 7):
    for y in range(1, 5): setb(x, y, -14, B["tiles"])
    setb(x, 5, -14, B["tile_slab"])
for x in (-7, 7):
    for y in range(1, 6): setb(x, y, -14, B["pillar"])
    setb(x, 6, -14, B["lamp"])
setb(-6, 4, -13, CAT + "azure_seastone_mural_thunder[face=wall,facing=south]")
setb(6, 4, -13, CAT + "azure_seastone_mural_sea[face=wall,facing=south]")
sign(-4, 2, -13, "south", ["REGLAS", "Hardcore real:", "si mueres quedas", "de espectador"])
sign(-2, 2, -13, "south", ["REVIVIR", "Cofre del Alma:", "sale en el chat", "tras una muerte"])
sign(0, 3, -13, "south", ["BIENVENIDOS", "aquí se muere", "de verdad", "suerte"])
sign(2, 2, -13, "south", ["ZONA SEGURA", "sin mobs, sin", "daño ni romper", "bloques"])
sign(4, 2, -13, "south", ["EVENTOS", "del Caos: a veces", "todo se pone", "peor por un rato"])

# letreros junto al spawn (el jugador aparece mirando al norte; el casino queda a su derecha)
sign_post(3, 1, 7, 0, ["CASINO", "→ al este", "tragamonedas y", "Cofre del Destino"])
sign_post(-3, 1, 7, 0, ["REGLAS", "↑ al norte", "léelas antes", "de salir"])

# ============================================================================================
# 3. Camino plaza → casino
for x in range(R + 1, CX0):
    for z in range(-2, 3):
        setb(x, 0, z, "polished_deepslate" if abs(z) <= 1 else "gold_block")
for x in (19,):
    for s in (-1, 1):
        for y in (1, 2, 3): setb(x, y, s * 4, B["arg_wall"])
        setb(x, 4, s * 4, B["lamp"])

# ============================================================================================
# 4. Casino
# zócalo y piso exterior
fill(CX0 - 1, 0, CZ0 - 1, CX1 + 1, 0, CZ1 + 1, "polished_blackstone_bricks")
# setos con flores alrededor (norte, sur y este)
for x in range(CX0, CX1 + 1):
    for z in (CZ0 - 2, CZ1 + 2):
        setb(x, 0, z, "grass_block")
        setb(x, 1, z, "flowering_azalea_leaves[persistent=true]" if x % 3 == 0 else "azalea_leaves[persistent=true]")
for z in range(CZ0 - 2, CZ1 + 3):
    setb(CX1 + 2, 0, z, "grass_block")
    setb(CX1 + 2, 1, z, "flowering_azalea_leaves[persistent=true]" if z % 3 == 0 else "azalea_leaves[persistent=true]")

# muros: argilita negra con pilastras cada 4, franja dorada y parapeto con faroles
fill(CX0, 1, CZ0, CX1, WALL_H, CZ1, B["arg_brick"])
fill(CX0 + 1, 1, CZ0 + 1, CX1 - 1, WALL_H, CZ1 - 1, "air")
def pilaster(x, z):
    return (x - CX0) % 4 == 0 if z in (CZ0, CZ1) else (z - CZ0) % 4 == 0
for x in range(CX0, CX1 + 1):
    for z in range(CZ0, CZ1 + 1):
        if x not in (CX0, CX1) and z not in (CZ0, CZ1): continue
        if pilaster(x, z):
            for y in range(1, WALL_H + 1): setb(x, y, z, B["arg_col"])
        setb(x, WALL_H + 1, z, "gold_block")
        if pilaster(x, z): setb(x, WALL_H + 2, z, B["lamp"])
        else: setb(x, WALL_H + 2, z, "polished_blackstone_brick_wall")
# ventanales escarlata (parte alta, sobre las máquinas) en norte y sur
for z in (CZ0, CZ1):
    for x in range(CX0 + 1, CX1):
        if (x - CX0) % 4 != 0: fill(x, 4, z, x, 6, z, B["glass_red"])
# rosetón morado detrás del Cofre del Destino (pared este)
for z in range(-4, 5):
    for y in range(1, WALL_H + 1):
        if (z / 3.6) ** 2 + ((y - 4) / 3.2) ** 2 <= 1: setb(CX1, y, z, B["glass_purple"])
setb(CX1, 4, 0, B["ancient"])

# techo con artesonado de metal antiguo y luces
fill(CX0 + 1, WALL_H + 1, CZ0 + 1, CX1 - 1, WALL_H + 1, CZ1 - 1, "polished_blackstone_bricks")
for x in range(CX0 + 1, CX1):
    for z in range(CZ0 + 1, CZ1):
        if (x - CX0) % 4 == 0 or (z - CZ0) % 4 == 0: setb(x, WALL_H + 1, z, B["ancient"])
        elif (x - CX0) % 4 == 2 and (z - CZ0) % 4 == 2: setb(x, WALL_H + 1, z, "shroomlight")

# fachada alta escalonada (pared oeste) con letrero CASINO iluminado
def facade_top(z): return 15 if abs(z) >= 11 else 16 if abs(z) >= 7 else 17
for z in range(-FACADE_Z, FACADE_Z + 1):
    top = facade_top(z)
    for y in range(WALL_H + 1, top + 1): setb(CX0, y, z, B["arg_brick"])
    setb(CX0, top + 1, z, "gold_block")
    setb(CX0 - 1, top, z, "polished_blackstone_brick_stairs[facing=east,half=top]")
for z in (CZ0, CZ1):
    for y in range(1, facade_top(z) + 1): setb(CX0, y, z, B["arg_col"])
    setb(CX0, facade_top(z) + 1, z, B["lamp"])
FONT = {
    "C": ["###", "#..", "#..", "#..", "###"], "A": [".#.", "#.#", "###", "#.#", "#.#"],
    "S": ["###", "#..", "###", "..#", "###"], "I": ["###", ".#.", ".#.", ".#.", "###"],
    "N": ["#.#", "###", "###", "#.#", "#.#"], "O": ["###", "#.#", "#.#", "#.#", "###"],
}
LX0, LY = -11, 9    # letras: z de -11 a 11, filas y=9..13 (sobresalen 1 bloque al frente)
fill(CX0 - 1, LY - 1, LX0 - 1, CX0 - 1, LY + 5, -LX0 + 1, "black_concrete")
for z in range(LX0 - 1, -LX0 + 2):
    setb(CX0 - 1, LY - 1, z, B["lamp"] if z % 2 == 0 else "gold_block")
    setb(CX0 - 1, LY + 5, z, B["lamp"] if z % 2 == 0 else "gold_block")
z = LX0
for ch in "CASINO":
    for r, row in enumerate(FONT[ch]):
        for c, px in enumerate(row):
            if px == "#": setb(CX0 - 1, LY + 4 - r, z + c, "gold_block")
    z += 4

# puerta 3x4 con marco de metal antiguo, marquesina con faroles y columnas
fill(CX0, 1, -1, CX0, 4, 1, "air")
for z in (-2, 2):
    for y in range(1, 6): setb(CX0, y, z, B["ancient"])
fill(CX0, 5, -2, CX0, 5, 2, B["ancient"])
for x in range(CX0 - 4, CX0):
    for z in range(-3, 4): setb(x, 6, z, "polished_blackstone_brick_slab[type=bottom]")
    setb(x, 6, -4, "gold_block"); setb(x, 6, 4, "gold_block")
for z in (-3, 3):
    for y in range(1, 6): setb(CX0 - 4, y, z, B["arg_col"])
for z in (-2, 0, 2): setb(CX0 - 3, 5, z, "lantern[hanging=true]")
# alfombra roja desde la plaza hasta el altar
for x in range(R + 1, 43): setb(x, 1, 0, "red_carpet")

# piso interior: tablero negro/gris con franjas doradas; pasillo central rojo
for x in range(CX0 + 1, CX1):
    for z in range(CZ0 + 1, CZ1):
        if abs(z) == 2: b = "gold_block"
        elif abs(z) <= 1: b = "red_nether_bricks"
        else: b = "black_concrete" if (x + z) % 2 == 0 else "polished_blackstone"
        setb(x, 0, z, b)

# tragamonedas: base de acero negro, pantalla de esmeralda (+ palanca), cabezal de metal antiguo, farol arriba
MACHINES = []
for x in MACHINE_X:
    for (z, face, out) in ((CZ0 + 1, "south", 1), (CZ1 - 1, "north", -1)):
        setb(x, 1, z, B["steel"])
        setb(x, 2, z, "emerald_block")
        setb(x, 3, z, B["ancient"])
        setb(x, 4, z, B["lamp"])
        for sx in (-1, 1):
            for y in (1, 2, 3): setb(x + sx, y, z, B["steel_wall"])
            setb(x + sx, 4, z, "end_rod[facing=up]")
        setb(x, 2, z + out, f"lever[face=wall,facing={face}]")
        setb(x, 1, z + 2 * out, "dark_oak_fence")
        setb(x, 2, z + 2 * out, "red_carpet")
        MACHINES.append([x, 2, z]); MACHINES.append([x, 2, z + out])

# mesas de cartas (tapete verde) con sillas
def card_table(cx, cz):
    for x in range(cx - 1, cx + 2):
        for z in (cz, cz + 1):
            setb(x, 1, z, "dark_oak_slab[type=top]")
            setb(x, 2, z, "green_carpet")
    for x in range(cx - 1, cx + 2):
        setb(x, 1, cz - 1, "dark_oak_stairs[facing=north]")
        setb(x, 1, cz + 2, "dark_oak_stairs[facing=south]")
    setb(cx - 2, 1, cz, "dark_oak_stairs[facing=west]"); setb(cx + 2, 1, cz + 1, "dark_oak_stairs[facing=east]")
for cx in (30, 38):
    card_table(cx, -6); card_table(cx, 5)

# candelabros: cadena + cruz de oro + faroles colgantes
for x in (26, 34, 42):
    for z in (-6, 0, 6):
        setb(x, WALL_H, z, "chain[axis=y]")
        for (dx, dz) in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)): setb(x + dx, WALL_H - 1, z + dz, "gold_block")
        for (dx, dz) in ((1, 0), (-1, 0), (0, 1), (0, -1)): setb(x + dx, WALL_H - 2, z + dz, "lantern[hanging=true]")

# altar del Cofre del Destino: gradas de obsidiana, pilares, velas
dx, dy, dz = DESTINO
fill(dx - 2, 1, -3, dx + 2, 1, 3, B["obs_polished"])
for z in range(-3, 4): setb(dx - 3, 1, z, CAT + "obsidian_brick_stairs[facing=east]")
fill(dx - 1, 2, -2, dx + 1, 2, 2, B["obs_chiseled"])
for z in range(-2, 3): setb(dx - 2, 2, z, CAT + "obsidian_brick_stairs[facing=east]")
setb(dx, 2, dz, "crying_obsidian")
setb(dx, dy, dz, "ender_chest[facing=west]")
for z in (-4, 4):
    for y in range(1, WALL_H + 1): setb(dx, y, z, B["obs_pillar"])
for (x, z) in ((dx - 1, -2), (dx - 1, 2), (dx + 1, -2), (dx + 1, 2)): setb(x, 3, z, "purple_candle[candles=4,lit=true]")
for z in (-2, 2): setb(dx, dy, z, "soul_lantern")

# letreros de precios: junto a la puerta (mirando adentro) y en los pilares del altar
sign(CX0 + 1, 3, -4, "east", ["TRAGAMONEDAS", "1 esmeralda", "clic en la palanca", "o la pantalla"])
sign(CX0 + 1, 3, 4, "east", ["COFRE DESTINO", "8 esmeraldas", "al fondo, en", "el altar"])
for z in (-4, 4):
    sign(dx - 1, 4, z, "west", ["COFRE DESTINO", "8 esmeraldas", "loot de cualquier", "estructura"])

# plantas en las esquinas interiores
for (x, z) in ((CX0 + 1, CZ0 + 1), (CX0 + 1, CZ1 - 1), (CX1 - 1, CZ0 + 1), (CX1 - 1, CZ1 - 1)):
    setb(x, 1, z, "potted_bamboo")

cmds.append(f"setworldspawn ~{SPAWN[0]} ~{SPAWN[1]} ~{SPAWN[2]} {SPAWN_ANGLE}")

# ============================================================================================
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("# Generado por scripts/gen-hub.py — no editar a mano\n")
    f.write("\n".join(cmds) + "\n")

layout = dict(zone=ZONE, machines=MACHINES, destino=list(DESTINO), spawn=list(SPAWN))
with open(LAYOUT_JS, "w", encoding="utf-8") as f:
    f.write("// priority: 100\n// Generado por scripts/gen-hub.py — no editar a mano. Coordenadas relativas al origen del hub.\n")
    f.write("global.HUB_LAYOUT = " + json.dumps(layout) + "\n")
print(f"{OUT}: {len(cmds)} comandos; {len(MACHINES)//2} tragamonedas")

# --- Vista previa opcional: planta (techo quitado dentro del casino) + fachada, como HTML ---
if "--preview" in sys.argv:
    out_dir = sys.argv[sys.argv.index("--preview") + 1]
    COL = [("lamp", "#f0a020"), ("lantern", "#ffcc55"), ("shroomlight", "#ff9944"), ("gold", "#e8c030"), ("ancient", "#c9a050"), ("sea_lantern", "#cfeff0"),
           ("emerald", "#20c060"), ("lever", "#999"), ("water", "#3060e0"), ("azure", "#a8d8e0"), ("sea_lantern", "#cfeff0"),
           ("cherry_leaves", "#f2a8c8"), ("cherry_log", "#5a2c36"), ("petals", "#f7b0d0"), ("azalea", "#4f8a2f"),
           ("grass", "#5d9b3a"), ("allium", "#b070e0"), ("tulip", "#f090b0"), ("valley", "#eee"), ("bluet", "#ddd"),
           ("scarlet", "#b01828"), ("purple_stained", "#8030c0"), ("purple_candle", "#a050e0"), ("crying", "#5020a0"),
           ("ender_chest", "#204040"), ("obsidian", "#2a1a40"), ("steel", "#30343a"), ("end_rod", "#fff"),
           ("red_carpet", "#c02020"), ("red_nether", "#5a1010"), ("green_carpet", "#2a7a2a"), ("dark_oak", "#4a3018"),
           ("black_concrete", "#111"), ("polished_blackstone", "#2a2630"), ("argillite", "#24222a"), ("deepslate", "#4a4a50"),
           ("chiseled_stone", "#8a8a8a"), ("cracked", "#7a7a7a"), ("stone_tile", "#9a9a98"), ("stone_pillar", "#b0b0ae"),
           ("stone_bricks", "#838383"), ("sign", "#6b4a2a"), ("bamboo", "#6a9a30"), ("chain", "#555"), ("mural", "#7fb8c8")]
    def color(b):
        for k, c in COL:
            if k in b: return c
        return "#f0f"
    xs = [p[0] for p in W]; zs = [p[2] for p in W]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    def top_block(x, z):
        ys = [y for (a, y, c) in W if a == x and c == z]
        if not ys: return None
        inside = CX0 < x < CX1 and CZ0 < z < CZ1
        if inside: ys = [y for y in ys if y < WALL_H - 1] or ys   # quita techo y candelabros para ver el interior
        return W[(x, max(ys), z)]
    S = 10
    cells = []
    for z in range(z0, z1 + 1):
        for x in range(x0, x1 + 1):
            b = top_block(x, z)
            if b: cells.append(f'<rect x="{(x - x0) * S}" y="{(z - z0) * S}" width="{S}" height="{S}" fill="{color(b)}"/>')
    plan = f'<svg width="{(x1 - x0 + 1) * S}" height="{(z1 - z0 + 1) * S}">' + "".join(cells) + "</svg>"
    # fachada vista desde el oeste (primer bloque no-aire desde x=CX0-6 hacia el este)
    fc = []
    for y in range(0, 18):
        for z in range(-14, 15):
            for x in range(CX0 - 6, CX1 + 1):
                b = W.get((x, y, z))
                if b:
                    fc.append(f'<rect x="{(z + 14) * S}" y="{(17 - y) * S}" width="{S}" height="{S}" fill="{color(b)}"/>'); break
    facade = f'<svg width="{29 * S}" height="{18 * S}">' + "".join(fc) + "</svg>"
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "hub-preview.html"), "w") as f:
        f.write('<html><body style="background:#5d9b3a;margin:0;padding:10px;font:14px sans-serif">'
                f'<div>Planta (norte arriba, casino a la derecha; sin techo)</div>{plan}'
                f'<div style="margin-top:12px">Fachada del casino (vista desde el oeste)</div><div style="background:#8ec5f0;display:inline-block">{facade}</div></body></html>')
    unknown = sorted({b for b in W.values() if color(b) == "#f0f"})
    if unknown: print("sin color en la vista previa:", unknown)
