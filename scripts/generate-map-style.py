#!/usr/bin/env python3
"""Fetches OpenFreeMap's "dark" vector style and recolors it to an Apple
Maps Dark Mode inspired palette (navy water, muted green parks, amber
motorways, brighter place labels), matching the app's own dark theme
tokens where they overlap (e.g. background/building match --background
and --card). Not run automatically — re-run manually and commit the
output if OpenFreeMap changes their base style layer IDs or you want to
retune the palette.

Usage: python3 scripts/generate-map-style.py
Writes: public/map-style-evntly-dark.json
"""

import json
import urllib.request

SOURCE_STYLE_URL = "https://tiles.openfreemap.org/styles/dark"
OUTPUT_PATH = "public/map-style-evntly-dark.json"

RECOLOR = {
    "background": {"background-color": "#101014"},
    "water": {"fill-antialias": False, "fill-color": "#0f2438"},
    "waterway": {"line-color": "#15304a"},
    "water_name": {"text-color": "rgba(150,180,210,0.85)", "text-halo-color": "#0a1826", "text-halo-width": 1},
    "landcover_wood": {
        "fill-color": "#152a1c",
        "fill-opacity": ["interpolate", ["exponential", 0.3], ["zoom"], 8, 0, 10, 0.8, 13, 0.4],
        "fill-pattern": "wood-pattern",
        "fill-translate": [0, 0],
    },
    "landuse_park": {"fill-color": "#16261c"},
    "building": {"fill-antialias": True, "fill-color": "#17171b", "fill-outline-color": "#232328"},
    "highway_minor": {
        "line-color": "#3a3a3c",
        "line-opacity": 0.9,
        "line-width": ["interpolate", ["exponential", 1.55], ["zoom"], 13, 1.8, 20, 20],
    },
    "highway_major_casing": {
        "line-color": "rgba(10,10,12,0.9)",
        "line-dasharray": [12, 0],
        "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 10, 3, 20, 23],
    },
    "highway_major_inner": {
        "line-color": "#5a5a5e",
        "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 10, 2, 20, 20],
    },
    "highway_major_subtle": {"line-color": "#3f3f43", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 2]},
    "highway_motorway_casing": {
        "line-color": "rgba(10,10,12,0.9)",
        "line-dasharray": [2, 0],
        "line-opacity": 1,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 5.8, 0, 6, 3, 20, 40],
    },
    "highway_motorway_inner": {
        "line-color": "#5a5a5e",
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 4, 2, 6, 1.3, 20, 30],
    },
    "highway_motorway_subtle": {
        "line-color": "#3f3f43",
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 4, 2, 6, 1.3],
    },
    "highway_name_other": {
        "text-color": "#9a9aa0",
        "text-halo-blur": 0,
        "text-halo-color": "#0a0a0c",
        "text-halo-width": 1,
        "text-translate": [0, 0],
    },
    "highway_name_motorway": {"text-color": "#9a9aa0", "text-translate": [0, 2]},
    "place_other": {"text-color": "#8e8e93", "text-halo-blur": 1, "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1},
    "place_suburb": {"text-color": "#9a9aa0", "text-halo-blur": 1, "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1},
    "place_village": {"icon-opacity": 0.7, "text-color": "#a8a8ae", "text-halo-blur": 1, "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1},
    "place_town": {"icon-opacity": 0.7, "text-color": "#a8a8ae", "text-halo-blur": 1, "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1},
    "place_city": {"icon-opacity": 0.7, "text-color": "#c7c7cc", "text-halo-blur": 1, "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1},
    "place_city_large": {"icon-opacity": 0.7, "text-color": "#e5e5ea", "text-halo-blur": 1, "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1},
}


def main() -> None:
    request = urllib.request.Request(SOURCE_STYLE_URL, headers={"User-Agent": "evntly-map-style-generator"})
    with urllib.request.urlopen(request) as resp:
        style = json.load(resp)

    changed = 0
    for layer in style["layers"]:
        if layer["id"] in RECOLOR:
            layer["paint"] = {**layer.get("paint", {}), **RECOLOR[layer["id"]]}
            changed += 1

    missing = set(RECOLOR) - {layer["id"] for layer in style["layers"]}
    if missing:
        raise SystemExit(f"Source style is missing expected layer ids: {sorted(missing)}")

    with open(OUTPUT_PATH, "w") as f:
        json.dump(style, f)

    print(f"Recolored {changed}/{len(RECOLOR)} layers -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
