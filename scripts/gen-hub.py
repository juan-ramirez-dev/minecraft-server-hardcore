#!/usr/bin/env python3
"""Genera la función hardcore_hub:build (lobby + casino) en server/kubejs/data/ (KubeJS la carga como datapack).
Pensado para una ladera: el lobby (donde se aparece) queda abajo y el casino en una terraza 5 bloques más arriba,
unidos por una escalinata. El terreno alrededor se recorta/rellena en pendiente para que encaje en la montaña.

Coordenadas locales: origen = punto de referencia del lobby a nivel del suelo (y=0 es el piso del lobby).
+z local = "frente" (hacia abajo de la montaña, donde está el lobby); el casino queda hacia -z.
ROT gira todo en sentido horario: 0 → el frente mira al sur, 1 → oeste, 2 → norte, 3 → este.
La ejecuta /hub construir (kubejs/server_scripts/hub_core.js). El layout (zona segura, máquinas, cofre, spawn) se exporta
a kubejs/server_scripts/hub_layout.js ya rotado.
Solo usa bloques vanilla y de mods que TAMBIÉN tienen los clientes (Cataclysm, Born in Chaos); nunca de mods solo-server.
Uso: python3 scripts/gen-hub.py [--rot N] [--preview DIR]"""
import os, sys, json, math, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "server/kubejs/data/hardcore_hub/functions/build.mcfunction")
LAYOUT_JS = os.path.join(ROOT, "server/kubejs/server_scripts/hub_layout.js")

ROT = int(sys.argv[sys.argv.index("--rot") + 1]) if "--rot" in sys.argv else 0

MC, ARG, CAT = "minecraft:", "born_in_chaos_v1:", "cataclysm:"
B = dict(
    lamp=ARG + "argillite_lamp", glass_red=ARG + "scarlet_stained_glass", glass_purple=ARG + "purple_stained_glass",
    qwall=CAT + "quartz_brick_wall", steel=CAT + "black_steel_block", steel_wall=CAT + "black_steel_wall",
    ancient=CAT + "ancient_metal_block", obs_chiseled=CAT + "chiseled_obsidian_bricks", obs_polished=CAT + "polished_obsidian",
    obs_pillar=CAT + "obsidian_pillar[axis=y]", obs_stairs=CAT + "obsidian_brick_stairs",
)

# --- Geometría (local) ---
YC = 5                               # piso de la terraza del casino (bloque); el lobby está en y=0
Y1 = YC + 1                          # primer bloque sobre el piso del casino
HX = 13                              # sala: interior x -13..13 (paredes en ±14)
HZ0, HZ1 = -36, -14                  # sala: pared trasera z=-36, pared frontal z=-14
WALL_TOP = 17                        # paredes de la sala hasta y=17, techo y=18
PAV_X0, PAV_X1, PAV_Z0, PAV_Z1 = 9, 17, -16, -10    # pabellón este (y su espejo al oeste)
PAV_TOP = 18
TERR = dict(x0=-19, x1=19, z0=-40, z1=-6)           # terraza (superficie y=YC)
LOBBY_C, LOBBY_R = (0, 11), 9
MACHINE_Z = [-18, -22, -26, -30]     # tragamonedas en las paredes oeste (x=-HX) y este (x=HX)
DESTINO = (0, YC + 3, -32)
SPAWN = (0, 1, 17)                   # en el lobby, mirando al casino (-z local)
SPAWN_ANGLE = 180
BLEND, K = 12, 1.0                   # ancho de la transición del terreno y pendiente (alto por bloque de distancia)
SAFE_MARGIN = 6

# ============================================================================================
# Rotación (local → mundo)
DIRS = ["north", "east", "south", "west"]
def rot_xz(x, z):
    for _ in range(ROT): x, z = -z, x
    return x, z
def rot_state(block):
    if ROT == 0 or "[" not in block: return block
    block = re.sub(r"facing=(north|east|south|west)", lambda m: "facing=" + DIRS[(DIRS.index(m.group(1)) + ROT) % 4], block)
    if ROT % 2: block = re.sub(r"axis=([xz])", lambda m: "axis=" + ("z" if m.group(1) == "x" else "x"), block)
    return re.sub(r"rotation=(\d+)", lambda m: f"rotation={(int(m.group(1)) + 4 * ROT) % 16}", block)

cmds = []
W = {}                               # mundo simulado en coordenadas locales (vista previa)

def _id(block): return block if ":" in block.split("[")[0] else MC + block

def fill(x0, y0, z0, x1, y1, z1, block, mode="", sim=True):
    block = _id(block)
    xs = sorted((x0, x1)); ys = sorted((y0, y1)); zs = sorted((z0, z1))
    area = (xs[1] - xs[0] + 1) * (zs[1] - zs[0] + 1)
    step = max(1, 32768 // area)     # límite de /fill
    (ax, az), (bx, bz) = rot_xz(xs[0], zs[0]), rot_xz(xs[1], zs[1])
    y = ys[0]
    while y <= ys[1]:
        ye = min(ys[1], y + step - 1)
        cmds.append(f"fill ~{ax} ~{y} ~{az} ~{bx} ~{ye} ~{bz} {rot_state(block)}{(' ' + mode) if mode else ''}")
        y = ye + 1
    if mode or not sim: return
    for x in range(xs[0], xs[1] + 1):
        for yy in range(ys[0], ys[1] + 1):
            for z in range(zs[0], zs[1] + 1):
                if block == MC + "air": W.pop((x, yy, z), None)
                else: W[(x, yy, z)] = block

def setb(x, y, z, block):
    block = _id(block)
    wx, wz = rot_xz(x, z)
    cmds.append(f"setblock ~{wx} ~{y} ~{wz} {rot_state(block)}")
    W[(x, y, z)] = block

def _sign_nbt(lines, color):
    msgs = []
    for i in range(4):
        t = lines[i] if i < len(lines) else ""
        bold = i == 0
        msgs.append("'" + json.dumps({"text": t, "bold": bold, "color": "dark_red" if bold else color}, ensure_ascii=False).replace("'", "\\'") + "'")
    return "{front_text:{has_glowing_text:1b,messages:[" + ",".join(msgs) + "]},is_waxed:1b}"
def sign(x, y, z, facing, lines, color="black", wood="spruce"):
    setb(x, y, z, f"{wood}_wall_sign[facing={facing}]" + _sign_nbt(lines, color))
def sign_post(x, y, z, rotation, lines, color="black", wood="spruce"):
    setb(x, y, z, f"{wood}_sign[rotation={rotation}]" + _sign_nbt(lines, color))

def leaves(x, y, z, i=0):
    kinds = ("azalea_leaves", "oak_leaves", "flowering_azalea_leaves", "azalea_leaves", "oak_leaves")
    setb(x, y, z, kinds[(x * 3 + y * 5 + z * 7 + i) % len(kinds)] + "[persistent=true]")

# ============================================================================================
# 1. Terreno: plataforma del lobby (y=0) y terraza del casino (y=YC), con transición en pendiente
foot = {}                            # (x,z) -> altura objetivo del suelo
for x in range(-20, 21):
    for z in range(-6, 22):
        if math.hypot(x - LOBBY_C[0], z - LOBBY_C[1]) <= LOBBY_R + 0.5: foot[(x, z)] = 0
for x in range(-20, 21):
    for z in range(-5, 3): foot[(x, z)] = 0          # escalinata, jardines y camino
for x in range(TERR["x0"] - 1, TERR["x1"] + 2):
    for z in range(TERR["z0"], TERR["z1"] + 1): foot[(x, z)] = YC
fl = list(foot.items())
fx = [p[0] for p in foot]; fz = [p[1] for p in foot]
for x in range(min(fx) - BLEND, max(fx) + BLEND + 1):
    for z in range(min(fz) - BLEND, max(fz) + BLEND + 1):
        if (x, z) in foot:
            t = foot[(x, z)]
            fill(x, t + 1, z, x, t + 64, z, "air", sim=False)
            fill(x, -30, z, x, t - 4, z, "stone", "replace minecraft:air")
            fill(x, -30, z, x, t - 4, z, "stone", "replace minecraft:water")
            fill(x, t - 3, z, x, t - 1, z, "dirt", sim=False)
            setb(x, t, z, "grass_block")
            continue
        d, t = min((math.hypot(x - a, z - b), tt) for (a, b), tt in fl)
        if d > BLEND: continue
        h = math.ceil(d * K)
        fill(x, t + h + 1, z, x, t + 64, z, "air", sim=False)
        fill(x, t - h, z, x, t + h, z, "air", "replace #minecraft:logs")       # sin troncos sueltos; las hojas caen solas
        fill(x, -30, z, x, t - h, z, "dirt", "replace minecraft:air")
        fill(x, t - h, z, x, t - h, z, "grass_block", "replace minecraft:dirt")
        for m in ("#minecraft:base_stone_overworld", "minecraft:dirt", "#minecraft:coal_ores"):   # el corte queda con pasto
            fill(x, t + h, z, x, t + h, z, "grass_block", f"replace {m}")

# ============================================================================================
# 2. Lobby: claro con arcos de hojas, estanque, terraza de madera y poste con farol
cx, cz = LOBBY_C
for x in range(cx - LOBBY_R, cx + LOBBY_R + 1):
    for z in range(cz - LOBBY_R, cz + LOBBY_R + 1):
        r = math.hypot(x - cx, z - cz)
        if r > LOBBY_R + 0.5: continue
        if 2.6 <= r <= 3.6 or (abs(x - cx) <= 1 and z > cz): setb(x, 0, z, "dirt_path")
        elif (x * 13 + z * 7) % 9 == 0: setb(x, 1, z, "grass")
        elif (x * 5 + z * 11) % 17 == 0: setb(x, 1, z, ["poppy", "dandelion", "oxeye_daisy", "cornflower"][(x + z) % 4])
for x in range(-2, 3):
    for z in range(0, 3): setb(x, 0, z, "dirt_path")
# estanque (oeste) con nenúfares y puente de madera
for x in range(cx - 8, cx):
    for z in range(cz - 4, cz + 5):
        if ((x - (cx - 5)) / 2.6) ** 2 + ((z - cz) / 3.4) ** 2 <= 1:
            setb(x, -1, z, "clay"); setb(x, 0, z, "water")
            if (x + z * 3) % 5 == 0: setb(x, 1, z, "lily_pad")
for x in range(cx - 8, cx - 2): setb(x, 1, cz, "spruce_slab[type=bottom]")
# terraza de madera (este) con baranda y bancos
for x in range(cx + 3, cx + 8):
    for z in range(cz - 3, cz + 4):
        if math.hypot(x - cx, z - cz) <= LOBBY_R - 0.5: setb(x, 0, z, "spruce_planks")
for z in range(cz - 3, cz + 4): setb(cx + 8, 1, z, "spruce_fence")
for z in (cz - 2, cz - 1, cz + 1, cz + 2): setb(cx + 6, 1, z, "spruce_stairs[facing=east]")
setb(cx + 6, 1, cz, "spruce_slab[type=bottom]")
for (bx, bz, f) in ((cx - 2, cz - 4, "north"), (cx + 2, cz - 4, "north")):
    setb(bx, 1, bz, f"spruce_stairs[facing={f}]")
# poste central con travesaño, faroles y bandera
for y in range(1, 7): setb(cx, y, cz, "spruce_fence")
for dx in (-1, 1):
    setb(cx + dx, 6, cz, "spruce_fence")
    setb(cx + dx, 5, cz, "lantern[hanging=true]")
setb(cx, 7, cz, "light_blue_banner[rotation=0]")
# arcos de hojas cruzados sobre el claro
for x in range(-10, 11):
    for y in range(1, 11):
        if 8.4 <= math.hypot(x, y) <= 9.8:
            for d in (-1, 0, 1):
                leaves(cx + x, y, cz + d)
                leaves(cx + d, y, cz + x, 1)
# faroles en el borde
for (lx, lz) in ((cx - 6, cz - 6), (cx + 6, cz - 6), (cx - 6, cz + 6), (cx + 6, cz + 6)):
    for y in (1, 2): setb(lx, y, lz, "spruce_fence")
    setb(lx, 3, lz, "lantern")
# letreros frente al spawn (miran al sur: se leen desde el spawn)
sign_post(-4, 1, 15, 0, ["REGLAS", "Hardcore real:", "si mueres quedas", "de espectador"])
sign_post(-2, 1, 15, 0, ["REVIVIR", "Cofre del Alma:", "sale en el chat", "tras una muerte"])
sign_post(2, 1, 15, 0, ["ZONA SEGURA", "sin mobs, sin", "daño ni romper", "bloques"])
sign_post(4, 1, 15, 0, ["CASINO", "sube la", "escalinata", "↑"])

# ============================================================================================
# 3. Escalinata con divisores blancos y jardines escalonados (setos + flores rojas)
for k in range(1, YC + 1):
    z = -k
    for x in range(-6, 7):
        if k > 1: fill(x, 0, z, x, k - 1, z, "stone_bricks")
        setb(x, k, z, "smooth_quartz_stairs[facing=north]" if abs(x) == 2 else "stone_brick_stairs[facing=north]")
    for x in (-7, 7):
        fill(x, 0, z, x, k, z, "quartz_bricks")
        setb(x, k + 1, z, B["qwall"])
for x in (-7, 7):
    setb(x, 1, 0, "quartz_bricks"); setb(x, 2, 0, B["qwall"]); setb(x, 3, 0, "lantern")
for side in (-1, 1):
    for k in range(1, YC + 1):
        z = -k
        for ax in range(8, 20):
            x = side * ax
            if k > 1: fill(x, 0, z, x, k - 2, z, "dirt")
            setb(x, k - 1, z, "grass_block")
            if k % 2: setb(x, k, z, "azalea_leaves[persistent=true]")
            else: setb(x, k, z, "red_tulip" if ax % 2 else "poppy")
    for k in range(0, YC + 1):            # muro de contención blanco al costado de los jardines
        fill(side * 20, 0, -k, side * 20, k, -k, "quartz_bricks")

# ============================================================================================
# 4. Explanada frente al casino, con fuentes laterales
for x in range(TERR["x0"], TERR["x1"] + 1):
    for z in range(-9, -5):
        setb(x, YC, z, "polished_andesite" if (x + z) % 2 else "stone_bricks")
for x in range(-6, 7):
    for z in range(-13, -5): setb(x, YC, z, "smooth_quartz" if abs(x) == 6 else "stone_bricks")
for sx in (-1, 1):
    fx_, fz_ = sx * 13, -7
    for x in range(fx_ - 1, fx_ + 2):
        for z in range(fz_ - 1, fz_ + 2):
            setb(x, Y1, z, "water" if (x, z) == (fx_, fz_) else "smooth_quartz")
    for (x, z) in ((fx_ - 1, fz_ - 1), (fx_ + 1, fz_ - 1), (fx_ - 1, fz_ + 1), (fx_ + 1, fz_ + 1)):
        setb(x, Y1 + 1, z, B["qwall"]); setb(x, Y1 + 2, z, B["qwall"]); setb(x, Y1 + 3, z, "lantern")

# ============================================================================================
# 5. Casino neoclásico
# sala: base blanca, cuerpo de ladrillo rojo con pilastras blancas, cornisa y parapeto
fill(-HX - 1, Y1, HZ0, HX + 1, WALL_TOP, HZ1, "bricks")
fill(-HX, Y1, HZ0 + 1, HX, WALL_TOP, HZ1 - 1, "air")
for x in range(-HX - 1, HX + 2):
    for z in range(HZ0, HZ1 + 1):
        if abs(x) != HX + 1 and z not in (HZ0, HZ1): continue
        setb(x, Y1, z, "quartz_bricks")
        if (abs(x) == HX + 1 and (z - HZ0) % 4 == 0) or (z in (HZ0, HZ1) and x % 4 == 0):
            for y in range(Y1 + 1, WALL_TOP): setb(x, y, z, "quartz_pillar[axis=y]")
        setb(x, WALL_TOP, z, "smooth_quartz")
        setb(x, WALL_TOP + 2, z, B["qwall"] if (x + z) % 4 else "chiseled_quartz_block")
# ventanales altos en los costados (sobre las máquinas) y rosetón morado atrás
for z in range(HZ0 + 1, HZ1):
    if (z - HZ0) % 4 == 0: continue
    for sx in (-1, 1): fill(sx * (HX + 1), 11, z, sx * (HX + 1), 15, z, "white_stained_glass_pane")
for x in range(-5, 6):
    for y in range(Y1 + 1, WALL_TOP):
        if (x / 4.6) ** 2 + ((y - 11) / 4.6) ** 2 <= 1: setb(x, y, HZ0, B["glass_purple"])
setb(0, 11, HZ0, B["ancient"])
# techo con tragaluz
fill(-HX - 1, WALL_TOP + 1, HZ0, HX + 1, WALL_TOP + 1, HZ1, "smooth_quartz")
fill(-3, WALL_TOP + 1, HZ0 + 4, 3, WALL_TOP + 1, HZ1 - 4, "glass")

# fachada frontal: pórtico con columnas, entablamento con luces, ventanales y puerta
for x in range(-9, 10):
    for z in range(-13, -9): setb(x, Y1, z, "smooth_quartz" if (x + z) % 2 else "quartz_bricks")
for x in (-9, -6, -3, 3, 6, 9):
    for y in range(Y1 + 1, Y1 + 7): setb(x, y, -10, "quartz_pillar[axis=y]")
    setb(x, Y1 + 7, -10, "chiseled_quartz_block")
    setb(x, Y1 + 5, -9, "red_wall_banner[facing=south]")
fill(-9, Y1 + 8, -13, 9, Y1 + 8, -10, "smooth_quartz")
for x in range(-9, 10):
    setb(x, Y1 + 8, -10, B["lamp"] if x % 2 == 0 else "chiseled_quartz_block")
    setb(x, Y1 + 9, -10, "red_nether_bricks")
    setb(x, Y1 + 10, -10, "quartz_bricks")
    setb(x, Y1 + 11, -10, B["qwall"])
    setb(x, Y1 + 9, -11, "quartz_bricks"); setb(x, Y1 + 10, -11, "quartz_bricks")
for x in range(-8, 9):
    if abs(x) <= 2: continue
    fill(x, Y1 + 1, HZ1, x, Y1 + 7, HZ1, "black_stained_glass_pane" if x % 3 else "quartz_pillar[axis=y]")
fill(-2, Y1 + 1, HZ1, 2, Y1 + 5, HZ1, "air")
fill(-2, Y1 + 6, HZ1, 2, Y1 + 6, HZ1, "chiseled_quartz_block")

# pabellones de las esquinas: marco blanco, ventanal alto, panel rojo ornamentado, balcón y agujas
for sx in (-1, 1):
    xa, xb = sorted((sx * PAV_X0, sx * PAV_X1))
    fill(xa, Y1, PAV_Z0, xb, PAV_TOP, PAV_Z1, "bricks")
    fill(xa, Y1, PAV_Z0, xb, Y1, PAV_Z1, "quartz_bricks")
    for (x, z) in ((xa, PAV_Z1), (xb, PAV_Z1), (xa, PAV_Z0), (xb, PAV_Z0)):
        for y in range(Y1, PAV_TOP + 1): setb(x, y, z, "quartz_pillar[axis=y]")
    mid = sx * 13
    for x in (mid - 1, mid, mid + 1):
        fill(x, Y1 + 1, PAV_Z1, x, Y1 + 6, PAV_Z1, "light_gray_stained_glass")
        fill(x, Y1 + 8, PAV_Z1, x, Y1 + 10, PAV_Z1, B["glass_red"])
    for x in (mid - 2, mid + 2): fill(x, Y1 + 1, PAV_Z1, x, Y1 + 11, PAV_Z1, "quartz_bricks")
    fill(mid - 2, Y1 + 7, PAV_Z1, mid + 2, Y1 + 7, PAV_Z1, "quartz_bricks")
    fill(mid - 2, Y1 + 11, PAV_Z1, mid + 2, Y1 + 11, PAV_Z1, "quartz_bricks")
    for x in range(mid - 2, mid + 3):
        setb(x, Y1 + 7, PAV_Z1 + 1, "smooth_quartz_slab[type=top]")
        setb(x, Y1 + 8, PAV_Z1 + 1, B["qwall"])
    fill(xa - 1, PAV_TOP, PAV_Z0 - 1, xb + 1, PAV_TOP, PAV_Z1 + 1, "smooth_quartz")
    for x in range(xa - 1, xb + 2):
        for z in range(PAV_Z0 - 1, PAV_Z1 + 2):
            if x in (xa - 1, xb + 1) or z in (PAV_Z0 - 1, PAV_Z1 + 1): setb(x, PAV_TOP + 1, z, B["qwall"])
    for (x, z) in ((xa - 1, PAV_Z1 + 1), (xb + 1, PAV_Z1 + 1), (xa - 1, PAV_Z0 - 1), (xb + 1, PAV_Z0 - 1)):
        setb(x, PAV_TOP + 1, z, "chiseled_quartz_block")
        setb(x, PAV_TOP + 2, z, "quartz_pillar[axis=y]")
        setb(x, PAV_TOP + 3, z, "end_rod[facing=up]"); setb(x, PAV_TOP + 4, z, "end_rod[facing=up]")
    for x in range(xa, xb + 1): setb(x, Y1, PAV_Z1 + 1, "azalea_leaves[persistent=true]")

# ============================================================================================
# 6. Interior
for x in range(-HX, HX + 1):
    for z in range(HZ0 + 1, HZ1):
        if abs(x) <= 1: b = "red_nether_bricks"
        elif abs(x) == 2: b = "gold_block"
        else: b = "smooth_quartz" if (x + z) % 2 else "black_concrete"
        setb(x, YC, z, b)
for z in range(DESTINO[2] + 4, -9):
    for x in (-1, 0, 1): setb(x, Y1, z, "red_carpet")

# tragamonedas contra las paredes laterales, mirando al centro
MACHINES = []
for z in MACHINE_Z:
    for (x, face, out) in ((-HX, "east", 1), (HX, "west", -1)):
        setb(x, Y1, z, B["steel"])
        setb(x, Y1 + 1, z, "emerald_block")
        setb(x, Y1 + 2, z, B["ancient"])
        setb(x, Y1 + 3, z, B["lamp"])
        for sz in (-1, 1):
            for y in range(Y1, Y1 + 3): setb(x, y, z + sz, B["steel_wall"])
            setb(x, Y1 + 3, z + sz, "end_rod[facing=up]")
        setb(x + out, Y1 + 1, z, f"lever[face=wall,facing={face}]")
        setb(x + 2 * out, Y1, z, "dark_oak_fence"); setb(x + 2 * out, Y1 + 1, z, "red_carpet")
        MACHINES.append([x, Y1 + 1, z]); MACHINES.append([x + out, Y1 + 1, z])

# mesas de cartas (tapete verde) con sillas
def card_table(tx, tz):
    for x in (tx, tx + 1):
        for z in range(tz - 1, tz + 2):
            setb(x, Y1, z, "dark_oak_slab[type=top]"); setb(x, Y1 + 1, z, "green_carpet")
    for z in range(tz - 1, tz + 2):
        setb(tx - 1, Y1, z, "dark_oak_stairs[facing=west]"); setb(tx + 2, Y1, z, "dark_oak_stairs[facing=east]")
for tx in (-7, 6):
    for tz in (-20, -26): card_table(tx, tz)

# candelabros
for x in (-6, 0, 6):
    for z in (-18, -24):
        for y in (WALL_TOP, WALL_TOP - 1): setb(x, y, z, "chain[axis=y]")
        for (dx, dz) in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)): setb(x + dx, WALL_TOP - 2, z + dz, "gold_block")
        for (dx, dz) in ((1, 0), (-1, 0), (0, 1), (0, -1)): setb(x + dx, WALL_TOP - 3, z + dz, "lantern[hanging=true]")

# altar del Cofre del Destino al fondo
dx_, dy_, dz_ = DESTINO
fill(-3, Y1, dz_ - 2, 3, Y1, dz_ + 2, B["obs_polished"])
for x in range(-3, 4): setb(x, Y1, dz_ + 3, B["obs_stairs"] + "[facing=north]")
fill(-1, Y1 + 1, dz_ - 1, 1, Y1 + 1, dz_ + 1, B["obs_chiseled"])
for x in range(-2, 3): setb(x, Y1 + 1, dz_ + 2, B["obs_stairs"] + "[facing=north]")
setb(0, Y1 + 1, dz_, "crying_obsidian")
setb(dx_, dy_, dz_, "ender_chest[facing=south]")
for x in (-4, 4):
    for y in range(Y1, WALL_TOP): setb(x, y, dz_, B["obs_pillar"])
    sign(x, Y1 + 3, dz_ + 1, "south", ["COFRE DESTINO", "8 esmeraldas", "loot de cualquier", "estructura"], wood="dark_oak")
for (x, z) in ((-1, dz_ - 1), (1, dz_ - 1), (-1, dz_ + 1), (1, dz_ + 1)): setb(x, Y1 + 2, z, "purple_candle[candles=4,lit=true]")

# letreros de precios en la entrada y plantas en las esquinas
sign_post(-3, Y1, HZ1 - 2, 0, ["TRAGAMONEDAS", "1 esmeralda", "clic en la palanca", "o la pantalla"], wood="dark_oak")
sign_post(3, Y1, HZ1 - 2, 0, ["COFRE DESTINO", "8 esmeraldas", "al fondo, en", "el altar"], wood="dark_oak")
for (x, z) in ((-HX, HZ0 + 1), (HX, HZ0 + 1)): setb(x, Y1, z, "potted_bamboo")

wsx, wsz = rot_xz(SPAWN[0], SPAWN[2])
cmds.append(f"setworldspawn ~{wsx} ~{SPAWN[1]} ~{wsz} {(SPAWN_ANGLE + 90 * ROT) % 360}")

# ============================================================================================
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("# Generado por scripts/gen-hub.py — no editar a mano\n")
    f.write("\n".join(cmds) + "\n")

def rp(p): x, z = rot_xz(p[0], p[2]); return [x, p[1], z]
corners = [rot_xz(min(fx) - SAFE_MARGIN, min(fz) - SAFE_MARGIN), rot_xz(max(fx) + SAFE_MARGIN, max(fz) + SAFE_MARGIN)]
ZONE = dict(minX=min(c[0] for c in corners), maxX=max(c[0] for c in corners),
            minZ=min(c[1] for c in corners), maxZ=max(c[1] for c in corners))
bc = [rot_xz(min(fx) - BLEND, min(fz) - BLEND), rot_xz(max(fx) + BLEND, max(fz) + BLEND)]
BOUNDS = dict(minX=min(c[0] for c in bc), maxX=max(c[0] for c in bc), minZ=min(c[1] for c in bc), maxZ=max(c[1] for c in bc))
layout = dict(rot=ROT, zone=ZONE, bounds=BOUNDS, machines=[rp(m) for m in MACHINES], destino=rp(DESTINO), spawn=rp(SPAWN))
with open(LAYOUT_JS, "w", encoding="utf-8") as f:
    f.write("// priority: 100\n// Generado por scripts/gen-hub.py — no editar a mano. Coordenadas relativas al origen del hub (ya rotadas).\n")
    f.write("global.HUB_LAYOUT = " + json.dumps(layout) + "\n")
print(f"{OUT}: {len(cmds)} comandos; {len(MACHINES)//2} tragamonedas; rot={ROT}")

# --- Vista previa opcional (coordenadas locales): alzado frontal + planta, como HTML ---
if "--preview" in sys.argv:
    out_dir = sys.argv[sys.argv.index("--preview") + 1]
    COL = [("lamp", "#f0a020"), ("lantern", "#ffcc55"), ("gold", "#e8c030"), ("ancient", "#c9a050"),
           ("emerald", "#20c060"), ("lever", "#999"), ("water", "#3060e0"), ("lily", "#2f7a2f"), ("scarlet", "#c01830"),
           ("purple_stained", "#8030c0"), ("purple_candle", "#a050e0"), ("crying", "#5020a0"), ("ender_chest", "#204040"),
           ("obsidian", "#2a1a40"), ("steel", "#30343a"), ("end_rod", "#fff"), ("red_carpet", "#c02020"), ("red_nether", "#6a1010"),
           ("red_wall_banner", "#c02020"), ("green_carpet", "#2a7a2a"), ("dark_oak", "#4a3018"), ("spruce", "#6b4c2a"),
           ("black_concrete", "#111"), ("black_stained", "#222a30"), ("light_gray_stained", "#c8d0d8"), ("white_stained", "#e8f0f8"),
           ("glass", "#cfe8f0"), ("quartz", "#f2eee6"), ("bricks", "#a8473a"), ("flowering", "#5f8f3a"), ("leaves", "#3f7a2a"),
           ("poppy", "#d02020"), ("tulip", "#e03030"), ("dandelion", "#f0e040"), ("daisy", "#eee"), ("cornflower", "#4060e0"),
           ("grass_block", "#5d9b3a"), ("grass", "#6aaa40"), ("dirt_path", "#a08850"), ("dirt", "#7a5a3a"), ("clay", "#9aa0b0"),
           ("andesite", "#8a8a8a"), ("stone", "#7d7d7d"), ("banner", "#60b0f0"), ("bamboo", "#6a9a30"), ("chain", "#555"),
           ("fence", "#6b4c2a"), ("sign", "#6b4a2a")]
    def color(b):
        for k, c in COL:
            if k in b: return c
        return "#f0f"
    xs = [p[0] for p in W]; zs = [p[2] for p in W]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    top = {}
    for (x, y, z), b in W.items():
        if -HX <= x <= HX and HZ0 < z < HZ1 and y >= WALL_TOP - 3: continue   # sin techo: se ve el interior
        if (x, z) not in top or y > top[(x, z)][0]: top[(x, z)] = (y, b)
    S = 8
    cells = []
    for (x, z), (y, b) in top.items():
        shade = 0.55 + 0.45 * min(1, max(0, (y + 2) / 26))
        cells.append(f'<rect x="{(x - x0) * S}" y="{(z - z0) * S}" width="{S}" height="{S}" fill="{color(b)}" opacity="{shade:.2f}"/>')
    plan = f'<svg width="{(x1 - x0 + 1) * S}" height="{(z1 - z0 + 1) * S}" style="background:#000">' + "".join(cells) + "</svg>"
    fc = []
    ymax = max(p[1] for p in W)
    for y in range(-1, ymax + 1):
        for x in range(x0, x1 + 1):
            for z in range(z1, z0 - 1, -1):
                b = W.get((x, y, z))
                if b:
                    fc.append(f'<rect x="{(x - x0) * S}" y="{(ymax - y) * S}" width="{S}" height="{S}" fill="{color(b)}"/>'); break
    facade = f'<svg width="{(x1 - x0 + 1) * S}" height="{(ymax + 2) * S}">' + "".join(fc) + "</svg>"
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "hub-preview.html"), "w") as f:
        f.write('<html><body style="background:#8ec5f0;margin:0;padding:10px;font:14px sans-serif">'
                f'<div>Alzado frontal (desde el lobby)</div>{facade}'
                f'<div style="margin-top:12px">Planta (casino arriba, lobby abajo; sin techo; más oscuro = más bajo)</div>{plan}</body></html>')
    unknown = sorted({b for b in W.values() if color(b) == "#f0f"})
    if unknown: print("sin color en la vista previa:", unknown)
