"""Completa i vuoti internazionali entro la copertura amministrativa NE.

Intervento additivo: non cancella isole, regioni o rivendicazioni esistenti.
Il mare esterno al riferimento e i fori confinanti con un solo paese non
sono candidati. Anche i vuoti aperti sulla costa vengono individuati.
"""
import json
import math
import hashlib
from collections import defaultdict
from audit_confini import geometry, polygons, area
from shapely import STRtree, union_all, get_coordinates, segmentize, voronoi_polygons, from_wkb, to_wkb
from shapely.geometry import MultiPoint, LineString, mapping
from shapely.prepared import prep


EPS = 1e-8  # tolleranza di contatto: circa un millimetro
AREA_EPS = 1e-12  # solo residui numerici dell'overlay, non soglia dei vuoti


def polygonal(g):
    return union_all(polygons(g))


def distribute(patch, candidates):
    """Ripartisce solo la superficie aggiunta fra le regioni confinanti.

    Il Voronoi dei bordi conserva l'adiacenza lungo una striscia che attraversa
    piu regioni; assegnarla tutta alla regione piu vicina al centro sarebbe
    sbagliato. I punti sono densificati e il risultato e ritagliato sul vuoto.
    """
    touching = [(code, g) for code, g in candidates if g.distance(patch) <= EPS]
    if not touching:
        # Un riferimento puo assegnare il vuoto a un paese che non ne tocca
        # ancora il bordo. Mantiene quel paese e sceglie la sua regione vicina.
        touching = [min(candidates, key=lambda item: (item[1].distance(patch), item[0]))]
    if len(touching) == 1:
        return {touching[0][0]: patch}
    edges = [(code, g.boundary.intersection(patch.buffer(EPS))) for code, g in touching]
    step = max(sum(edge.length for _, edge in edges) / 2000, 0.0001)
    seed_owners = defaultdict(set)
    for code, edge in sorted(edges):
        for x, y in get_coordinates(segmentize(edge, step)):
            seed_owners[(float(x), float(y))].add(code)
    # Un vertice comune non deve essere attribuito arbitrariamente a una
    # regione: i semi sui due lati mantengono la bisettrice nel punto comune.
    seeds = {point: next(iter(owners)) for point, owners in seed_owners.items() if len(owners) == 1}
    if len(seeds) < 2:
        return {min(touching, key=lambda item: (item[1].distance(patch.representative_point()), item[0]))[0]: patch}
    # Correzione della scala longitudinale locale per non distorcere le
    # distanze alle alte latitudini. Non proietta/arrotonda i bordi originali.
    from shapely.affinity import scale
    factor = max(.01, math.cos(math.radians(patch.representative_point().y)))
    points = MultiPoint([(x * factor, y) for x, y in seeds])
    cells = voronoi_polygons(points, extend_to=scale(patch.envelope, xfact=factor, yfact=1, origin=(0, 0)), ordered=True)
    pieces = defaultdict(list)
    for cell, code in zip(cells.geoms, seeds.values()):
        part = polygonal(scale(cell, xfact=1/factor, yfact=1, origin=(0, 0)).intersection(patch))
        if not part.is_empty:
            pieces[code].append(part)
    assigned = {code: union_all(parts) for code, parts in pieces.items()}
    remainder = polygonal(patch.difference(union_all(list(assigned.values()))))
    # Chiude anche i residui numerici delle celle senza un buffer che
    # invaderebbe le geometrie gia presenti.
    for p in polygons(remainder):
        code = min(touching, key=lambda item: (item[1].distance(p), item[0]))[0]
        assigned[code] = union_all([assigned.get(code), p])
    return assigned


def align(countries, regions, reference, work=None):
    codes = sorted(countries)
    geoms = [countries[c] for c in codes]
    print('[confini condivisi] Unione della copertura esistente', flush=True)
    land = union_all(list(reference.values()))
    # Cache locale verificata: consente di riprendere un collaudo senza
    # ricalcolare l'overlay mondiale, ma non riusa dati di un'altra sorgente.
    digest = hashlib.sha256()
    for g in [*geoms, land]:
        digest.update(to_wkb(g))
    key = digest.hexdigest()
    cache = work / 'shared-missing.wkb' if work else None
    key_file = work / 'shared-missing.sha256' if work else None
    if cache and cache.exists() and key_file.exists() and key_file.read_text() == key:
        missing = from_wkb(cache.read_bytes())
    else:
        world = union_all(geoms)
        missing = land.difference(world)
        if cache:
            cache.write_bytes(to_wkb(missing))
            key_file.write_text(key)
    print('[confini condivisi] Ricerca mondiale dei vuoti fra paesi', flush=True)
    # Indicizza brevi tratti di bordo, non il bbox dell'intera Russia o del
    # Canada: una prova di distanza su quei poligoni costa milioni di vertici
    # anche quando il candidato e una minuscola striscia costiera.
    borders, border_owners = [], []
    for code, g in zip(codes, geoms):
        for p in polygons(g):
            for ring in [p.exterior, *p.interiors]:
                coords = list(ring.coords)
                for offset in range(0, len(coords)-1, 64):
                    borders.append(LineString(coords[offset:offset+65]))
                    border_owners.append(code)
    tree = STRtree(borders)
    gaps = []
    for p in polygons(missing):
        if p.area <= AREA_EPS:
            continue
        neighbors = sorted({border_owners[int(i)] for i in tree.query(p, predicate='dwithin', distance=EPS)})
        if len(neighbors) >= 2:
            gaps.append((p, neighbors))
    print(f'[confini condivisi] {len(gaps)} vuoti amministrativi da chiudere', flush=True)
    ref_codes = sorted(reference)
    ref_tree = STRtree([reference[c] for c in ref_codes])
    region_geoms = {iso: [(f['properties']['code'], geometry(f)) for f in fs] for iso, fs in regions.items()}
    additions = defaultdict(list)
    nation_additions = defaultdict(list)
    records = []
    for index, (gap, neighbors) in enumerate(gaps):
        if index and index % 500 == 0:
            print(f'[confini condivisi] Ripartiti {index}/{len(gaps)} vuoti', flush=True)
        remaining = gap
        owners = []
        for i in sorted(ref_tree.query(gap)):
            iso = ref_codes[int(i)]
            part = polygonal(remaining.intersection(reference[iso]))
            if part.is_empty:
                continue
            remaining = polygonal(remaining.difference(part))
            owners.append(iso)
            nation_additions[iso].append(part)
            if iso in regions:
                for component in polygons(part):
                    for code, piece in distribute(component, region_geoms[iso]).items():
                        additions[code].append(piece)
        if remaining.area > AREA_EPS:
            raise ValueError(f'Vuoto senza assegnazione nel riferimento: {index}')
        records.append({'type': 'Feature', 'properties': {
            'id': index, 'neighbors': neighbors, 'owners': owners,
            'area_km2': area(gap), 'point': list(gap.representative_point().coords)[0],
        }, 'geometry': mapping(gap)})
    changed = []
    numeric_source_residuals = []
    for iso, fs in regions.items():
        for f in fs:
            code = f['properties']['code']
            if code not in additions:
                continue
            old = geometry(f)
            updated = union_all([old, *additions[code]])
            if not updated.is_valid or updated.is_empty or updated.geom_type not in ('Polygon', 'MultiPolygon'):
                raise ValueError('Regione non valida dopo allineamento: ' + code)
            lost = old.difference(updated)
            if lost.area > AREA_EPS:
                # L'overlay in doppia precisione puo lasciare residui lungo
                # un bordo lunghissimo. Il buffer e solo un controllo entro
                # un millimetro: non viene scritto in nessuna geometria.
                if lost.difference(updated.buffer(EPS)).area > AREA_EPS:
                    raise ValueError('Superficie regionale rimossa: ' + code)
                numeric_source_residuals.append({'code': code, 'km2': area(lost)})
            f['geometry'] = mapping(updated)
            changed.append(code)
    final = dict(countries)
    for iso, parts in nation_additions.items():
        final[iso] = union_all([countries[iso], *parts])
    # Usa l'unione effettivamente serializzata delle regioni anche per i paesi.
    for iso in regions:
        if iso in nation_additions:
            final[iso] = union_all([geometry(f) for f in regions[iso]])
    residual = []
    prepared = {code: prep(g) for code, g in final.items()}
    for record in records:
        target = geometry(record)
        if any(prepared[iso].covers(target) for iso in record['properties']['owners']):
            continue
        after = union_all([final[iso].intersection(target) for iso in record['properties']['owners']])
        rest = target.difference(after)
        if rest.area > AREA_EPS:
            # Per strisce submillimetriche l'intersezione puo collassare a
            # una linea. Controlla il contorno reale con un piccolo contesto,
            # non il risultato gia collassato del ritaglio sul vuoto.
            context = target.envelope.buffer(EPS * 10)
            nearby = union_all([final[iso].intersection(context) for iso in record['properties']['owners']])
            if rest.difference(nearby.buffer(EPS)).area > AREA_EPS:
                residual.append({'id': record['properties']['id'], 'area_degrees2': rest.area})
    report = {'policy': 'Fill only uncovered NE administrative land touching at least two countries',
              'reference': 'countries_reference.geojson (Natural Earth)',
              'gaps': len(records), 'filled_km2': sum(r['properties']['area_km2'] for r in records),
              'countries': sorted(nation_additions), 'regions': sorted(changed), 'residual': residual}
    report['numerical_tolerance_degrees'] = EPS
    report['numeric_source_residuals'] = numeric_source_residuals
    if work:
        (work / 'shared-border-gaps.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': records}), encoding='utf-8')
        (work / 'shared-border-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    if residual:
        raise ValueError('Restano vuoti amministrativi: ' + str(residual[:5]))
    print(f'[confini condivisi] Chiusi {len(records)} vuoti, {len(changed)} regioni aggiornate', flush=True)
    return final, report
