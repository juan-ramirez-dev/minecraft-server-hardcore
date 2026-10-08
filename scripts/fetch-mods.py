#!/usr/bin/env python3
"""Descarga los jars del pack (no se guardan en git) y los deja en pack/mods y pack/server-only.
- Mods de Modrinth: según pack/meta/modrinth-mods.json, verificando sha512.
- FTB Quests/Library/Teams: desde CurseForge (no están en Modrinth), verificando tamaño.
Luego: scripts/sync-mods.sh para copiarlos a server/mods.
Uso: python3 scripts/fetch-mods.py"""
import json, os, hashlib, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = {'User-Agent': 'mc-hardcore-setup/1.0'}
CURSEFORGE = [  # (projectId, fileId, nombre, tamaño)
    (289412, 8078538, 'ftb-quests-forge-2001.4.22.jar', 1255469),
    (404465, 8226927, 'ftb-library-forge-2001.2.13.jar', 780558),
    (404468, 7499810, 'ftb-teams-forge-2001.3.2.jar', 252579),
]
def fetch(url, headers=H):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers)).read()
meta = json.load(open(os.path.join(ROOT, 'pack/meta/modrinth-mods.json')))
for d in ('pack/mods', 'pack/server-only'): os.makedirs(os.path.join(ROOT, d), exist_ok=True)
for m in meta.values():
    dst = os.path.join(ROOT, 'pack/server-only' if m['side'] == 'S' else 'pack/mods', m['file'])
    if os.path.exists(dst) and hashlib.sha512(open(dst, 'rb').read()).hexdigest() == m['sha512']: continue
    data = fetch(m['url'])
    assert hashlib.sha512(data).hexdigest() == m['sha512'], m['file']
    open(dst, 'wb').write(data); print('ok', m['file'])
for pid, fid, name, size in CURSEFORGE:
    dst = os.path.join(ROOT, 'pack/mods', name)
    if os.path.exists(dst) and os.path.getsize(dst) == size: continue
    data = fetch(f'https://www.curseforge.com/api/v1/mods/{pid}/files/{fid}/download', {'User-Agent': 'Mozilla/5.0'})
    assert len(data) == size, name
    open(dst, 'wb').write(data); print('ok', name)
print('Listo.')
