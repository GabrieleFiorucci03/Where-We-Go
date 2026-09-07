"""Audit geometrico riproducibile; dipendenze: Shapely 2.1, pyproj 3.7.

Uso: python tools/audit_confini.py --data web/data --raw data_raw/confini
     --out data_raw/confini-audit/baseline.json
Le aree sono misurate su ellissoide WGS84; gli scarti in Mercatore sono
convertiti in pixel CSS a zoom 12 (mondo MapLibre di 512 pixel a zoom 0).
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'data_raw/confini-audit/python'))
from shapely import make_valid, union_all
from shapely.geometry import shape
from shapely.ops import transform
from pyproj import Geod, Transformer

GEOD = Geod(ellps='WGS84')
MERCATOR = Transformer.from_crs(4326, 3857, always_xy=True).transform
PIXEL12 = 40075016.68557849 / (512 * 2**12)
SAMPLE = ['ITA', 'AUT', 'CHE', 'FRA', 'PHL', 'IND', 'PAK', 'CHN']


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def polygons(g):
    if g.geom_type == 'Polygon':
        return [g]
    return [p for c in getattr(g, 'geoms', []) for p in polygons(c)]


def area(g):
    # Separate absolute areas avoid cancellation from ring orientation.
    from shapely.geometry.polygon import orient
    return sum(abs(GEOD.geometry_area_perimeter(orient(p))[0]) for p in polygons(g)) / 1e6


def geometry(f):
    g=shape(f['geometry'])
    if g.is_valid:
        return g
    # Feature omonime fuse possono contenere poligoni sovrapposti: la
    # semantica e' unione, non even/odd sull'intero MultiPolygon invalido.
    return union_all([make_valid(p) for p in polygons(g)])


def audit(data, raw):
    countries = {f['properties']['code']: (
        read(data / 'country-shapes' / (f['properties']['code'] + '.geojson')) if f.get('mask') else f
    ) for f in read(data / 'countries.geojson')['features']}
    regions = {}
    with (raw / 'regions.ndjson').open(encoding='utf-8') as stream:
        for line in stream:
            f = json.loads(line)
            regions.setdefault(f['properties']['country'], []).append(f)
    report = {'sample': {}, 'international_overlaps_km2': {}, 'invalid_raw': [], 'counts': {
        'countries': len(countries), 'regions': sum(map(len, regions.values()))}}
    # L'identita' paese = unione regioni implica la stessa copertura in tutte
    # le combinazioni acceso/spento, anche con il solo vicino acceso.
    report['mixed_mode'] = {'checked': 0, 'mismatches': []}
    for iso, features in regions.items():
        nation = geometry(countries[iso])
        united = union_all([geometry(f) for f in features])
        report['mixed_mode']['checked'] += 1
        difference = nation.symmetric_difference(united)
        if not difference.is_empty:
            report['mixed_mode']['mismatches'].append({'country': iso, 'difference_km2': area(difference)})
        for f in features:
            if not shape(f['geometry']).is_valid:
                report['invalid_raw'].append(f['properties']['code'])
    for iso in SAMPLE:
        nation = geometry(countries[iso])
        fs = regions[iso]
        gs = [geometry(f) for f in fs]
        united = union_all(gs)
        masks = {}
        for f in read(data / 'regions' / f'{iso}.geojson')['features']:
            code = f['properties']['code']
            masks[code] = geometry(read(data / 'region-shapes' / f'{code}.geojson') if f.get('mask') else f)
        errors = []
        for f, g in zip(fs, gs):
            mask = masks[f['properties']['code']]
            errors.append({
                'code': f['properties']['code'],
                'difference_km2': area(g.symmetric_difference(mask)),
                'hausdorff_px_z12': transform(MERCATOR, g).hausdorff_distance(transform(MERCATOR, mask)) / PIXEL12,
            })
        report['sample'][iso] = {
            'country_outside_regions_km2': area(nation.difference(united)),
            'regions_outside_country_km2': area(united.difference(nation)),
            'regional_overlap_km2': max(0, sum(area(g) for g in gs) - area(united)),
            'mask_difference_km2': sum(e['difference_km2'] for e in errors),
            'mask_max_hausdorff_px_z12': max(e['hausdorff_px_z12'] for e in errors),
            'worst_masks': sorted(errors, key=lambda e: e['hausdorff_px_z12'], reverse=True)[:3],
        }
        print(iso, json.dumps(report['sample'][iso]), flush=True)
    for a, b in [('ITA','AUT'), ('ITA','CHE'), ('AUT','CHE'), ('IND','PAK'), ('IND','CHN')]:
        x = union_all([geometry(f) for f in regions[a]])
        y = union_all([geometry(f) for f in regions[b]])
        report['international_overlaps_km2'][f'{a}/{b}'] = area(x.intersection(y))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'web/data')
    parser.add_argument('--raw', type=Path, default=ROOT / 'data_raw/confini')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.data, args.raw)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding='utf-8')
    if result['mixed_mode']['mismatches']:
        raise ValueError('Sagome stato/regioni diverse: vedere mixed_mode nel rapporto')
