#!/usr/bin/env python3
"""Erzeugt data.js aus den Swift-Quellen der Mac/iOS-App (WorldData.swift, BorderData.swift).
Aufruf (im Ordner WebApp):  python3 tools/make_data.py"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parents[2] / "MacApp/Sources/MosaikAfrika"
world = (root / "WorldData.swift").read_text()
border = (root / "BorderData.swift").read_text()

countries = []
pat = re.compile(r'\.init\(code: "(\w+)", name: "([^"]+)", capital: "([^"]+)", lon: ([-\d.]+), lat: ([-\d.]+), '
                 r'population: ([\d.]+), area: ([\d.]+), island: (true|false)\)')
for m in pat.finditer(world):
    c, n, cap, lon, lat, pop, area, isl = m.groups()
    countries.append({"code": c, "name": n, "capital": cap, "lon": float(lon), "lat": float(lat),
                      "population": float(pop), "area": float(area), "island": isl == "true"})

bsec = world[world.index("static let borders"):world.index("static let seaRoutes")]
borders = {a: re.findall(r'"(\w+)"', lst) for a, lst in re.findall(r'"(\w+)": \[([^\]]*)\]', bsec)}
ssec = world[world.index("static let seaRoutes"):world.index("static let adjacency")]
sea = re.findall(r'\("(\w+)", "(\w+)"\)', ssec)

raw = border[border.index('"""') + 3:border.rindex('"""')]
shapes = {}
for entry in raw.split(";"):
    entry = entry.strip()
    if ":" not in entry: continue
    code, rings = entry.split(":", 1)
    shapes[code] = [[[float(v) for v in p.split(",")] for p in ring.split() if "," in p] for ring in rings.split("|")]

out = ("// Automatisch erzeugt von tools/make_data.py – nicht von Hand ändern.\n"
       "// Ländergrenzen: Natural Earth 1:50m (gemeinfrei), projiziert auf 1000×884.\n"
       f"const COUNTRIES = {json.dumps(countries, ensure_ascii=False)};\n"
       f"const LAND_BORDERS = {json.dumps(borders)};\n"
       f"const SEA_ROUTES = {json.dumps(sea)};\n"
       f"const SHAPES = {json.dumps(shapes, separators=(',', ':'))};\n")
(pathlib.Path(__file__).resolve().parents[1] / "data.js").write_text(out)
print(len(countries), "Länder,", len(borders), "Grenzlisten,", len(sea), "Seewege,", len(shapes), "Umrisse")
