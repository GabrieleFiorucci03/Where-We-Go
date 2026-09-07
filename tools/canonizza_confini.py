"""Un solo contorno per paese: unione delle regioni, NE solo senza regioni.

I vuoti internazionali vengono completati sul riferimento amministrativo NE
prima di derivare i contorni nazionali e le maschere delle bandiere.
"""
import argparse
import json
import shutil
from pathlib import Path
from audit_confini import geometry, area, polygons, read
from shapely import union_all
from shapely.geometry import mapping
from allinea_confini import align


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def canonizza(data, work, reference):
    original_regions = work / 'regions-before-alignment.ndjson'
    if not original_regions.exists():
        shutil.copyfile(work / 'regions.ndjson', original_regions)
    countries = {f['properties']['code']: f for f in read(reference)['features']}
    regions = {}
    for line in (work / 'regions.ndjson').read_text(encoding='utf-8').splitlines():
        f = json.loads(line)
        code = f['properties']['country']
        if code not in countries:
            raise ValueError('Paese regionale sconosciuto: ' + code)
        regions.setdefault(code, []).append(f)
    reference_geoms = {code: geometry(f) for code, f in countries.items()}
    outlines = {code: (union_all([geometry(f) for f in regions[code]])
                      if code in regions else reference_geoms[code]) for code in countries}
    outlines, shared = align(outlines, regions, reference_geoms, work)
    changed = set(shared['regions'])
    for fs in regions.values():
        for f in fs:
            code = f['properties']['code']
            if code in changed:
                filename = data / 'region-shapes' / f'{code}.geojson'
                mask = read(filename) if filename.exists() else f
                filename.parent.mkdir(parents=True, exist_ok=True)
                filename.write_text(dump({**mask, 'geometry': f['geometry']}), encoding='utf-8')
    with (work / 'regions.ndjson').open('w', encoding='utf-8') as stream:
        for fs in regions.values():
            for f in fs:
                stream.write(dump(f) + '\n')
    report = {'policy': {
        'country_outline': 'union_of_normalized_regions',
        'fallback': 'Natural Earth only for countries without regions',
        'international_gap_completion': 'Natural Earth reference; additive only',
        'country_masks': 'loaded individually; catalog retains reference geometry',
    }, 'adopted': {}, 'fallback': {}, 'shared_borders': shared}
    result = {}
    catalog = []
    shapes = data / 'country-shapes'
    shapes.mkdir(parents=True, exist_ok=True)
    for code, country in countries.items():
        old = reference_geoms[code]
        if code in regions:
            united = outlines[code]
            if not united.is_valid or united.is_empty or united.geom_type not in ('Polygon', 'MultiPolygon'):
                # Un ripiego silenzioso riprodurrebbe proprio il difetto misto.
                raise ValueError('Unione regionale non valida: ' + code)
            result[code] = {**country, 'geometry': mapping(united)}
            report['adopted'][code] = {
                'before_difference_km2': area(old.symmetric_difference(united)),
                'after_difference_km2': 0,
                'source': 'union_of_normalized_regions',
                'reference_outside_regions_km2': area(old.difference(united)),
                'regions_outside_reference_km2': area(united.difference(old)),
                'reference_components_not_covered': sum(
                    not united.covers(p.representative_point()) for p in polygons(old)),
            }
        else:
            result[code] = {**country, 'geometry': mapping(outlines[code])}
            report['fallback'][code] = {'reason': 'no_regions'}
        (shapes / f'{code}.geojson').write_text(dump(result[code]), encoding='utf-8')
        # Riferimento leggero all'avvio; tile e bandiere usano result[code].
        catalog.append({**country, 'mask': True})
    (data / 'countries.geojson').write_text(
        dump({'type': 'FeatureCollection', 'features': catalog}), encoding='utf-8')
    with (work / 'countries.ndjson').open('w', encoding='utf-8') as stream:
        for f in result.values():
            stream.write(dump(f) + '\n')
    for folder in {work, data}:
        (folder / 'canonical-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'adopted': len(report['adopted']), 'fallback': len(report['fallback'])}), flush=True)
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data', type=Path, required=True)
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--reference', type=Path, required=True)
    args = p.parse_args()
    canonizza(args.data, args.work, args.reference)
