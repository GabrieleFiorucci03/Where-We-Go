"""Valida tutte le sagome; ripiega sulla fonte se la riduzione la invalida."""
import argparse
import json
from pathlib import Path
from audit_confini import read, shape, geometry
from shapely.geometry import mapping


def verify(data,work,repair=False):
    invalid_source=[]
    invalid_mask=[]
    restored=[]
    repaired_source=[]
    raw=[]
    for line in (work/'regions.ndjson').read_text(encoding='utf-8').splitlines():
        source=json.loads(line)
        raw.append(source)
        code=source['properties']['code']
        filename=data/'region-shapes'/f'{code}.geojson'
        mask=read(filename)
        valid_source=shape(source['geometry']).is_valid
        if not valid_source:
            invalid_source.append(code)
            if repair:
                fixed=geometry(source)
                if not fixed.is_valid or fixed.is_empty or fixed.geom_type not in ('Polygon','MultiPolygon'):
                    raise ValueError('Impossibile riparare la fonte '+code)
                source['geometry']=mapping(fixed)
                mask['geometry']=source['geometry']
                filename.write_text(json.dumps(mask,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
                valid_source=True
                repaired_source.append(code)
        if not shape(mask['geometry']).is_valid:
            if repair and valid_source:
                mask['geometry']=source['geometry']
                filename.write_text(json.dumps(mask,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
                restored.append(code)
            else:
                invalid_mask.append(code)
    unexpected=sorted(set(invalid_mask)-set(invalid_source))
    if repair:
        with (work/'regions.ndjson').open('w',encoding='utf-8') as stream:
            for f in raw:stream.write(json.dumps(f,ensure_ascii=False,separators=(',',':'))+'\n')
    result={'invalid_source_before':invalid_source,'repaired_source':repaired_source,
            'invalid_mask':invalid_mask,'restored':restored,'unexpected':unexpected}
    (work/'mask-validity.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True)
    if unexpected:
        raise ValueError('Nuove geometrie invalide: '+','.join(unexpected))
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data',type=Path,required=True)
    p.add_argument('--work',type=Path,required=True)
    p.add_argument('--repair',action='store_true')
    args=p.parse_args()
    verify(args.data,args.work,args.repair)
