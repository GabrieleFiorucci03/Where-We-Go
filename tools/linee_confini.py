"""Rete dei contorni di visualizzazione, separata dalle superfici marcabili.

Le sovrapposizioni conservate nei riempimenti non devono generare due linee.
Per il solo tratto grafico si da precedenza al paese piu piccolo, cosi gli
stati inclusi nelle geometrie dei vicini restano visibili. A parita di area
decide il codice. Le regioni disegnano solo bordi interni.
"""
import argparse
import json
from pathlib import Path
from audit_confini import geometry, read
from shapely import STRtree, set_precision, union_all, line_merge
from shapely.geometry import mapping

GRID = 1e-7  # griglia comune centimetrica, solo per le linee

def lines(g):
    if g.geom_type in ('LineString', 'LinearRing'):
        return [g] if g.length else []
    return [p for part in getattr(g, 'geoms', []) for p in lines(part)]

def network(countries, regions, emit):
    codes = sorted(countries, key=lambda c: (-countries[c].area, c))
    gs = [set_precision(countries[c], GRID) for c in codes]
    tree = STRtree(gs)
    visible, borders = {}, {}
    for i, (code, g) in enumerate(zip(codes, gs)):
        print(f'[linee] Partizione {i+1}/{len(codes)} {code}', flush=True)
        higher = [int(j) for j in tree.query(g, predicate='intersects') if int(j) > i]
        part = g.difference(union_all([gs[j] for j in higher])) if higher else g
        visible[code] = part
        borders[code] = part.boundary
        if part.is_empty:
            raise ValueError('Paese interamente nascosto nella rete: ' + code)
    bt = STRtree(list(borders.values()))
    report = {'policy': 'display only; smaller polygon area takes precedence, then country code',
              'countries': len(codes), 'regions': sum(map(len, regions.values())),
              'national_features': 0, 'regional_features': 0, 'grid_degrees': GRID}
    for i, code in enumerate(codes):
        border = borders[code]
        # Una linea comune viene emessa una volta, anche se appartiene a due paesi.
        higher = [int(j) for j in bt.query(border, predicate='intersects') if int(j) > i]
        unique = border
        # Sottrarre i poligoni gia disgiunti evita di costruire e nodare
        # milioni di segmenti costieri estranei al bordo comune.
        for j in higher:
            unique = unique.difference(visible[codes[j]])
        for line in lines(line_merge(unique)):
            emit('country-borders', code, line)
            report['national_features'] += 1
        fs = regions.get(code, [])
        if fs:
            regional = [set_precision(geometry(f), GRID) for f in fs]
            outer = union_all(regional).boundary
            inner = union_all([g.boundary for g in regional]).difference(outer)
            # Il bordo ritagliato non diventa una nuova linea: si ritagliano
            # le linee interne gia estratte, poi si esclude il bordo nazionale.
            inner = inner.intersection(visible[code]).difference(border)
            for line in lines(line_merge(inner)):
                emit('region-borders', code, line)
                report['regional_features'] += 1
        print(f'[linee] {i+1}/{len(codes)} {code}', flush=True)
    return report

def finish(work):
    """Noda la rete globale e toglie gli ultimi tratti coincidenti tra livelli.

    Gli overlay nazionali indipendenti possono lasciare brevi coincidenze
    sui bordi introdotti dai vicini. Il controllo finale usa la rete intera.
    """
    national, regional = [], []
    filename = work / 'border-lines.ndjson'
    for line in filename.read_text(encoding='utf-8').splitlines():
        f = json.loads(line)
        if f['tippecanoe']['layer'] == 'country-borders':
            national.append(geometry(f))
        else:
            regional.append(f)
    print('[linee] Deduplicazione finale della rete mondiale', flush=True)
    merged = lines(line_merge(union_all(national)))
    tree = STRtree(merged)
    counts = {'national_features': len(merged), 'regional_features': 0}
    temp = work / 'border-lines-final.ndjson'
    with temp.open('w', encoding='utf-8') as out:
        def emit(layer, code, g):
            out.write(json.dumps({'type': 'Feature', 'properties': {'country': code},
                                 'geometry': mapping(g), 'tippecanoe': {'layer': layer, 'minzoom': 0 if layer == 'country-borders' else 3}},
                                separators=(',', ':')) + '\n')
        for g in merged:
            emit('country-borders', 'world', g)
        for f in regional:
            g = geometry(f)
            hits = tree.query(g, predicate='dwithin', distance=GRID * 2)
            if len(hits):
                # Le intersezioni di segmenti lunghi possono variare nelle
                # ultime cifre dopo la serializzazione. Il taglio di pochi
                # centimetri lascia la linea regionale sotto lo spessore
                # del tratto nazionale, senza spostare alcun confine.
                g = g.difference(union_all([merged[int(i)] for i in hits]).buffer(GRID * 2))
            for part in lines(line_merge(g)):
                emit('region-borders', f['properties']['country'], part)
                counts['regional_features'] += 1
    temp.replace(filename)
    return counts

def build(data, work):
    countries = {f['properties']['code']: geometry(read(data / 'country-shapes' / (f['properties']['code'] + '.geojson')))
                 for f in read(data / 'countries.geojson')['features']}
    regions = {}
    for line in (work / 'regions.ndjson').read_text(encoding='utf-8').splitlines():
        f = json.loads(line)
        regions.setdefault(f['properties']['country'], []).append(f)
    with (work / 'border-lines.ndjson').open('w', encoding='utf-8') as out:
        def emit(layer, code, g):
            out.write(json.dumps({'type': 'Feature', 'properties': {'country': code},
                                 'geometry': mapping(g), 'tippecanoe': {'layer': layer, 'minzoom': 0 if layer == 'country-borders' else 3}},
                                separators=(',', ':')) + '\n')
        report = network(countries, regions, emit)
    report.update(finish(work))
    (work / 'border-lines-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data', type=Path, required=True)
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--finish-only', action='store_true')
    args = p.parse_args()
    if args.finish_only:
        report = read(args.work / 'border-lines-report.json')
        report.update(finish(args.work))
        (args.work / 'border-lines-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report), flush=True)
    else:
        build(args.data, args.work)
