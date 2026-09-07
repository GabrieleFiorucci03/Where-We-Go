import json
import tempfile
import unittest
from pathlib import Path
from audit_confini import ROOT, geometry, read
from canonizza_confini import canonizza
from shapely import union_all
from shapely.geometry import box, mapping, MultiPolygon


def feature(code, g, country=None):
    props = {'code': code, 'name': code}
    if country: props['country'] = country
    return {'type': 'Feature', 'properties': props, 'geometry': mapping(g)}


class CanonicalTests(unittest.TestCase):
    def run_case(self, countries, regions):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            ref = folder / 'reference.json'
            ref.write_text(json.dumps({'features': countries}), encoding='utf-8')
            raw = '\n'.join(json.dumps(f) for f in regions)
            (folder / 'regions.ndjson').write_text(raw, encoding='utf-8')
            report = canonizza(folder, folder, ref)
            rendered = {f['properties']['code']: geometry(f) for f in
                        map(json.loads, (folder / 'countries.ndjson').read_text(encoding='utf-8').splitlines())}
            for code, g in rendered.items():
                self.assertTrue(g.equals(geometry(read(folder / 'country-shapes' / f'{code}.geojson'))))
            self.assertEqual([json.loads(line) for line in (folder / 'regions.ndjson').read_text(encoding='utf-8').splitlines()],
                             [json.loads(line) for line in raw.splitlines()])
            return report, rendered

    def test_mixed_modes_use_identical_surface(self):
        # I due dataset sono continui, ma il confine e' x=1 negli stati e
        # x=1.01 nelle regioni: prima il modo misto lasciava una striscia.
        countries = [feature('AAA', box(0, 0, 1, 1)), feature('BBB', box(1, 0, 2, 1))]
        regions = [feature('AAA.one', box(0, 0, 1.01, 1), 'AAA'),
                   feature('BBB.one', box(1.01, 0, 2, 1), 'BBB')]
        report, countries = self.run_case(countries, regions)
        for a in [False, True]:
            for b in [False, True]:
                ga = geometry(regions[0]) if a else countries['AAA']
                gb = geometry(regions[1]) if b else countries['BBB']
                self.assertTrue(union_all([ga, gb]).equals(box(0, 0, 2, 1)))
                self.assertEqual(ga.intersection(gb).area, 0)
        self.assertEqual(len(report['adopted']), 2)

    def test_regional_islands_and_holes_survive(self):
        mainland = box(0, 0, 1, 1).difference(box(.4, .4, .6, .6))
        region = MultiPolygon([mainland, box(2, 0, 2.01, .01)])
        _, countries = self.run_case([feature('AAA', box(0, 0, 1, 1))],
            [feature('AAA.one', region, 'AAA')])
        self.assertTrue(countries['AAA'].equals(region))

    def test_source_disagreement_is_reported_without_mixed_fallback(self):
        report, countries = self.run_case([feature('AAA', box(0, 0, 1, 1))],
            [feature('AAA.one', box(0, 0, .9, 1), 'AAA')])
        self.assertIn('AAA', report['adopted'])
        self.assertGreater(report['adopted']['AAA']['reference_outside_regions_km2'], 0)
        self.assertTrue(countries['AAA'].equals(box(0, 0, .9, 1)))

    def test_fallback_without_regions(self):
        report, countries = self.run_case([feature('AAA', box(0, 0, 1, 1))], [])
        self.assertEqual(report['fallback']['AAA']['reason'], 'no_regions')
        self.assertTrue(countries['AAA'].equals(box(0, 0, 1, 1)))

    def test_disputed_sources_are_not_modified(self):
        regions = [feature('AAA.one', box(0, 0, 1.1, 1), 'AAA'),
                   feature('BBB.one', box(.9, 0, 2, 1), 'BBB')]
        _, countries = self.run_case([feature('AAA', box(0, 0, 1, 1)),
                                     feature('BBB', box(1, 0, 2, 1))], regions)
        self.assertTrue(countries['AAA'].equals(geometry(regions[0])))
        self.assertTrue(countries['BBB'].equals(geometry(regions[1])))


if __name__ == '__main__': unittest.main()
