"""Verifica il file di linee prodotto: nessun tratto ripetuto tra i livelli."""
import argparse
import json
import math
from collections import Counter
from pathlib import Path
from audit_confini import geometry
from shapely import union_all
from shapely import STRtree
from shapely.geometry import Point

def audit(work):
    national, regional = [], []
    for line in (work / 'border-lines.ndjson').read_text(encoding='utf-8').splitlines():
        f = json.loads(line)
        g = geometry(f)
        if not g.is_valid or g.is_empty or g.geom_type != 'LineString':
            raise ValueError('Tratto non valido')
        (national if f['tippecanoe']['layer'] == 'country-borders' else regional).append(g)
    print('[audit linee] Controllo sovrapposizioni dei tratti nazionali', flush=True)
    nation_net = union_all(national)
    repeated = math.fsum(g.length for g in national) - nation_net.length
    ends = Counter(tuple(p) for g in national for p in [g.coords[0], g.coords[-1]])
    # Un'estremita puo incontrare l'interno di un'altra linea, non soltanto
    # un'altra estremita. La griglia di generazione e centimetrica.
    line_tree = STRtree(national)
    dangling, junction_distances = [], []
    for p, n in ends.items():
        if n != 1 or not (72 <= p[0] <= 81 and 31 <= p[1] <= 38):
            continue
        point = Point(p)
        nearby = [national[int(i)] for i in line_tree.query(point, predicate='dwithin', distance=2e-7)
                  if p not in [national[int(i)].coords[0], national[int(i)].coords[-1]]]
        if nearby:
            junction_distances.append(min(g.distance(point) for g in nearby))
        else:
            dangling.append(list(p))
    print('[audit linee] Controllo perimetri regionali duplicati', flush=True)
    region_net = union_all(regional)
    shared = nation_net.intersection(region_net).length
    result = {'national_features': len(national), 'regional_features': len(regional),
              'repeated_national_length_degrees': repeated, 'national_regional_shared_length_degrees': shared,
              'china_india_pakistan_dangling_endpoints': dangling,
              'max_junction_gap_degrees': max(junction_distances, default=0), 'junction_tolerance_degrees': 2e-7}
    (work / 'line-audit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result), flush=True)
    if repeated > 1e-6 or shared > 1e-6 or dangling:
        raise ValueError('Tratti ripetuti nella rete')

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--work', type=Path, required=True)
    audit(p.parse_args().work)
