import sys,unittest,json,tempfile
from pathlib import Path
sys.path.insert(0,str(Path('tools').resolve()))
from allinea_confini import align,distribute
from shapely.geometry import box,mapping,Polygon
from shapely import union_all
from audit_confini import geometry

def feature(code,g):
    return {'type':'Feature','properties':{'code':code,'country':code[:3]},'geometry':mapping(g)}

class SharedBordersTests(unittest.TestCase):
    def test_canonical_outputs_all_use_the_repaired_surface(self):
        from canonizza_confini import canonizza
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            refs=[feature('AAA',box(0,0,1,1)),feature('BBB',box(1,0,2,1))]
            raw=[feature('AAA.one',box(0,0,.9,1)),feature('BBB.one',box(1.1,0,2,1))]
            ref=folder/'reference.json'
            ref.write_text(json.dumps({'features':refs}),encoding='utf-8')
            (folder/'regions.ndjson').write_text('\n'.join(map(json.dumps,raw)),encoding='utf-8')
            result=canonizza(folder,folder,ref)
            self.assertEqual(result['shared_borders']['gaps'],1)
            final=[json.loads(line) for line in (folder/'regions.ndjson').read_text(encoding='utf-8').splitlines()]
            for f in final:
                code=f['properties']['code']
                country=code[:3]
                region_mask=json.loads((folder/'region-shapes'/f'{code}.geojson').read_text(encoding='utf-8'))
                country_mask=json.loads((folder/'country-shapes'/f'{country}.geojson').read_text(encoding='utf-8'))
                self.assertTrue(geometry(f).equals(geometry(region_mask)))
                self.assertTrue(geometry(f).equals(geometry(country_mask)))
            self.assertTrue(union_all([geometry(f) for f in final]).equals(box(0,0,2,1)))

    def test_open_coastal_gap_with_multiple_regions(self):
        refs={'AAA':box(0,0,1,1),'BBB':box(1,0,2,1)}
        regions={'AAA':[feature('AAA.south',box(0,0,.9,.5)),feature('AAA.north',box(0,.5,.9,1))],
                 'BBB':[feature('BBB.one',box(1.1,0,2,1))]}
        before={k:union_all([geometry(f) for f in fs]) for k,fs in regions.items()}
        after,report=align(before,regions,refs)
        self.assertEqual(report['gaps'],1)
        self.assertTrue(union_all(list(after.values())).equals(box(0,0,2,1)))
        self.assertLess(after['AAA'].symmetric_difference(refs['AAA']).area,1e-12)
        self.assertLess(geometry(regions['AAA'][0]).symmetric_difference(box(0,0,1,.5)).area,1e-10)
        for k in before:self.assertLess(before[k].difference(after[k]).area,1e-12)

    def test_water_outside_administrative_reference_survives(self):
        refs={'AAA':box(0,0,.9,1),'BBB':box(1.1,0,2,1)}
        after,report=align(refs,{},refs)
        self.assertEqual(report['gaps'],0)
        self.assertTrue(union_all(list(after.values())).equals(union_all(list(refs.values()))))

    def test_single_country_hole_survives(self):
        refs={'AAA':box(0,0,1,1),'BBB':box(1,0,2,1)}
        before={'AAA':refs['AAA'].difference(box(.4,.4,.6,.6)),'BBB':refs['BBB']}
        regions={k:[feature(k+'.one',g)] for k,g in before.items()}
        after,report=align(before,regions,refs)
        self.assertEqual(report['gaps'],0)
        self.assertTrue(after['AAA'].equals(before['AAA']))

    def test_three_countries_and_regionless_neighbor(self):
        refs={'AAA':box(0,0,1,1),'BBB':box(1,0,2,1),'CCC':box(0,1,2,2)}
        hole=box(.9,.9,1.1,1.1)
        before={k:g.difference(hole) for k,g in refs.items()}
        regions={k:[feature(k+'.one',before[k])] for k in ['AAA','BBB']}
        after,report=align(before,regions,refs)
        self.assertEqual(report['gaps'],1)
        self.assertTrue(union_all(list(after.values())).equals(box(0,0,2,2)))
        self.assertEqual(len(report['countries']),3)

if __name__=='__main__':unittest.main()
