#!/usr/bin/env python3
"""Genera dist/Hardcore-Coop-<ver>.mrpack y dist/Hardcore-Coop-<ver>-mods.zip a partir de pack/.
Mods de Modrinth van por referencia (URL + hashes); los .jar que no están en Modrinth (FTB, CurseForge)
van dentro del paquete en overrides/mods. pack/overrides/ (config, kubejs...) se copia tal cual.
Uso: python3 scripts/build-mrpack.py 1.0.0"""
import json, os, sys, zipfile, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VER = sys.argv[1] if len(sys.argv) > 1 else "1.0.0"
MC, FORGE = "1.20.1", "47.4.26"
meta = json.load(open(os.path.join(ROOT, "pack/meta/modrinth-mods.json")))
by_file = {m["file"]: m for m in meta.values()}
mods_dir = os.path.join(ROOT, "pack/mods")
jars = sorted(f for f in os.listdir(mods_dir) if f.endswith(".jar") and not f.startswith("._"))
files, embedded = [], []
for f in jars:
    m = by_file.get(f)
    if not m:
        embedded.append(f); continue
    files.append({"path": "mods/" + f, "hashes": {"sha1": m["sha1"], "sha512": m["sha512"]},
                  "env": {"client": "required", "server": "unsupported" if m["side"] == "C" else "required"},
                  "downloads": [m["url"]], "fileSize": m["size"]})
index = {"formatVersion": 1, "game": "minecraft", "versionId": VER, "name": "Hardcore Coop",
         "summary": "Hardcore cooperativo: dificultad progresiva, jefes de Cataclysm/Mowzie's, revivir caro.",
         "files": files, "dependencies": {"minecraft": MC, "forge": FORGE}}
os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
out = os.path.join(ROOT, f"dist/Hardcore-Coop-{VER}.mrpack")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("modrinth.index.json", json.dumps(index, indent=1))
    for f in embedded:
        z.write(os.path.join(mods_dir, f), "overrides/mods/" + f)
    ov = os.path.join(ROOT, "pack/overrides")
    for dp, dn, fn in os.walk(ov):
        for f in fn:
            if f.startswith("._") or f == ".DS_Store": continue
            p = os.path.join(dp, f)
            z.write(p, "overrides/" + os.path.relpath(p, ov))
zout = os.path.join(ROOT, f"dist/Hardcore-Coop-{VER}-mods.zip")
with zipfile.ZipFile(zout, "w", zipfile.ZIP_STORED) as z:
    for f in jars:
        z.write(os.path.join(mods_dir, f), "mods/" + f)
print(f"{out}: {len(files)} mods por referencia + {len(embedded)} embebidos {embedded}")
print(f"{zout}: {len(jars)} jars")
