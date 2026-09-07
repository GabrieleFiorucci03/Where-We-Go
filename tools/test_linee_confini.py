import unittest
import json
import tempfile
from pathlib import Path
from linee_confini import network, finish
from shapely.geometry import box, mapping, LineString
from shapely import union_all

def region(code, geom):
    return {'type': 'Feature', 'properties': {'country': code}, 'geometry': mapping(geom)}

class BorderLinesTests(unittest.TestCase):
    def test_overlapping_countries_have_one_border_and_no_exterior_region_line(self):
        countries = {'AAA': box(0, 0, 1.1, 1), 'BBB': box(.9, 0, 2, 1)}
        regions = {'AAA': [region('AAA', box(0, 0, 1.1, .5)), region('AAA', box(0, .5, 1.1, 1))],
                   'BBB': [region('BBB', countries['BBB'])]}
        out = []
        network(countries, regions, lambda layer, code, g: out.append((layer, code, g)))
        national = [g for layer, _, g in out if layer == 'country-borders']
        expected = union_all([box(0, 0, 2, 1).boundary, LineString([(.9, 0), (.9, 1)])])
        self.assertTrue(union_all(national).equals(expected))
        self.assertAlmostEqual(sum(g.length for g in national), expected.length)
        inner = union_all([g for layer, _, g in out if layer == 'region-borders'])
        self.assertTrue(inner.equals(LineString([(0, .5), (.9, .5)])))
        self.assertEqual(inner.intersection(expected).length, 0)

    def test_three_country_junction_deduplicates_shared_segments(self):
        countries = {'AAA': box(0, 0, 1, 1.1), 'BBB': box(1, 0, 2, 1.1), 'CCC': box(0, 1, 2, 2)}
        out = []
        network(countries, {}, lambda layer, code, g: out.append(g))
        expected = union_all([box(0, 0, 2, 2).boundary, LineString([(0, 1.1), (2, 1.1)]), LineString([(1, 0), (1, 1.1)])])
        self.assertTrue(union_all(out).equals(expected))
        self.assertAlmostEqual(sum(g.length for g in out), expected.length)

    def test_global_finish_removes_cross_layer_coincidences(self):
        border = LineString([(0, 0), (0, 2)])
        features = [
            ('country-borders', 'AAA', border),
            ('country-borders', 'BBB', LineString([(0, 1), (0, 2)])),
            ('region-borders', 'AAA', LineString([(1, 1), (0, 1), (0, 2)])),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            file = work / 'border-lines.ndjson'
            file.write_text('\n'.join(json.dumps({'type': 'Feature', 'properties': {'country': code},
                'tippecanoe': {'layer': layer}, 'geometry': mapping(g)}) for layer, code, g in features), encoding='utf-8')
            finish(work)
            result = [json.loads(line) for line in file.read_text(encoding='utf-8').splitlines()]
            from audit_confini import geometry
            national = [geometry(f) for f in result if f['tippecanoe']['layer'] == 'country-borders']
            regional = [geometry(f) for f in result if f['tippecanoe']['layer'] == 'region-borders']
            self.assertAlmostEqual(sum(g.length for g in national), 2)
            self.assertTrue(union_all(national).equals(border))
            self.assertLess(union_all(regional).hausdorff_distance(LineString([(0, 1), (1, 1)])), 3e-7)
            self.assertEqual(union_all(regional).intersection(border).length, 0)

if __name__ == '__main__':
    unittest.main()
