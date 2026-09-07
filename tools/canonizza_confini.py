"""Un solo contorno per paese: unione delle regioni, NE solo senza regioni.

Le differenze territoriali fra fonti vengono documentate, senza mescolare
contorni nello stesso paese o modificare le regioni ai confini internazionali.
"""
import argparse
import json
from pathlib import Path
from audit_confini import geometry, area, polygons, read
from shapely import union_all
from shapely.geometry import mapping


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def canonizza(data, work, reference):
    countries = {f['properties']['code']: f for f in read(reference)['features']}
    regions = {}
    for line in (work / 'regions.ndjson').read_text(encoding='utf-8').splitlines():
        f = json.loads(line)
        code = f['properties']['country']
        if code not in countries:
            raise ValueError('Paese regionale sconosciuto: ' + code)
        regions.setdefault(code, []).append(f)
    report = {'policy': {
        'country_outline': 'union_of_normalized_regions',
        'fallback': 'Natural Earth only for countries without regions',
        'international_snapping': False,
        'country_masks': 'loaded individually; catalog retains reference geometry',
    }, 'adopted': {}, 'fallback': {}}
    result = {}
    catalog = []
    shapes = data / 'country-shapes'
    shapes.mkdir(parents=True, exist_ok=True)
    for code, country in countries.items():
        old = geometry(country)
        if code in regions:
            united = union_all([geometry(f) for f in regions[code]])
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
            result[code] = {**country, 'geometry': mapping(old)}
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
