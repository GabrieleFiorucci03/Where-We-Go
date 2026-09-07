"""Reduce corrected flag masks while preserving every component and ring."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'data_raw/confini-audit/python'))
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform

TO_M = Transformer.from_crs(4326, 3857, always_xy=True).transform
TO_DEG = Transformer.from_crs(3857, 4326, always_xy=True).transform

def polygons(g):
    if g.geom_type == 'Polygon':
        return [g]
    return [p for c in getattr(g, 'geoms', []) for p in polygons(c)]

def rings(g):
    return sum(len(p.interiors) + 1 for p in polygons(g))

def rounded(value):
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, float):
        return round(value, 6)
    return value

def main(root):
    root = Path(root)
    data, work = root / 'data', root / 'work'
    raw = [json.loads(line) for line in (work / 'regions.ndjson').read_text(encoding='utf-8').splitlines()]
    changed = set(json.loads((work / 'shared-border-report.json').read_text(encoding='utf-8'))['regions'])
    done = 0
    for f in raw:
        code = f['properties']['code']
        if code not in changed:
            continue
        filename = data / 'region-shapes' / f'{code}.geojson'
        mask = json.loads(filename.read_text(encoding='utf-8'))
        source = shape(f['geometry'])
        current = shape(mask['geometry'])
        n, r = len(polygons(source)), rings(source)
        simplified = transform(TO_DEG, transform(TO_M, current).simplify(30, preserve_topology=True))
        candidate = shape(rounded(mapping(simplified)))
        if candidate.is_valid and len(polygons(candidate)) == n and rings(candidate) == r:
            mask['geometry'] = mapping(candidate)
            filename.write_text(json.dumps(mask, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            done += 1
    print(json.dumps({'changed': len(changed), 'simplified': done}))

if __name__ == '__main__':
    import sys
    main(sys.argv[1])
