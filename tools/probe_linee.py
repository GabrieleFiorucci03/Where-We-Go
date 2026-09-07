"""Punti sulle vecchie linee interne alle sovrapposizioni internazionali."""
import json
import argparse
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'data_raw/confini-audit/python'))
from audit_confini import read, geometry, polygons
from linee_confini import lines
from shapely import set_precision, union_all
from shapely.ops import nearest_points

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data', type=Path, default=root / 'web/data')
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
network_file = root / 'data_raw/confini-audit/lines-20260907/work/border-lines.ndjson'
network = union_all([geometry(json.loads(line)) for line in network_file.read_text(encoding='utf-8').splitlines()
                     if json.loads(line)['tippecanoe']['layer'] == 'country-borders'])
pairs = [('NPL', 'CHN'), ('PAK', 'CHN'), ('AFG', 'CHN'), ('KGZ', 'CHN'), ('ITA', 'SVN'), ('SVN', 'HRV'), ('IND', 'CHN'), ('IND', 'PAK')]
out = []
for a, b in pairs:
    aa, bb = [set_precision(geometry(read(args.data / 'country-shapes' / (c + '.geojson'))), 1e-7) for c in [a, b]]
    winner, loser = (aa, bb) if aa.area < bb.area else (bb, aa)
    overlap = winner.intersection(loser)
    obsolete = loser.boundary.intersection(winner).difference(winner.boundary)
    # Un punto effettivamente distante dal contorno scelto permette di
    # distinguere le due linee in un test renderizzato.
    candidates = [line.interpolate(t, normalized=True) for line in sorted(lines(obsolete), key=lambda g: -g.length)[:100]
                  for t in [.25, .5, .75]]
    # Scegli un vecchio tratto che la nuova rete non conserva. In questo modo
    # il test resta valido anche quando una terza geometria passa nella stessa
    # zona contesa (caso frequente nel Kashmir).
    obsolete_candidates = sorted(candidates, key=lambda p: -p.distance(network))
    p = obsolete_candidates[0]
    q = nearest_points(p, winner.boundary)[1]
    out.append({'countries': [a, b], 'obsolete': [p.x, p.y], 'retained': [q.x, q.y],
                'separation_degrees': p.distance(q), 'overlap_degrees2': overlap.area})
path = args.out
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, indent=2), encoding='utf-8')
print(json.dumps(out))
