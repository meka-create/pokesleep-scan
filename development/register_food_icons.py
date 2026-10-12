#!/usr/bin/env python3
"""Register approved transparent food icon PNGs without guessing unseen sprites."""
import argparse,hashlib,json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
def put(p,v):pathlib.Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def bump(root,tag):
    app=root/'app.js';s=app.read_text(encoding='utf-8')
    for pat,repl in [(r"const BUILD_ID='[^']+'","const BUILD_ID='v12-"+tag+"'"),
                     (r"CHECKPOINT_RELEASE_ID='[^']+'","CHECKPOINT_RELEASE_ID='"+tag+"'"),
                     (r"version:'v12-[^']+'","version:'v12-"+tag+"'")]:
        s,n=re.subn(pat,lambda _:repl,s,count=1)
        if n!=1:raise ValueError('unknown app release layout')
    sw=root/'sw.js'
    sws,n=re.subn(r"const RELEASE_ID = '[^']+';",lambda _:"const RELEASE_ID = '"+tag+"';",
                   sw.read_text(encoding='utf-8'),count=1)
    if n!=1:raise ValueError('unknown service worker release layout')
    app.write_text(s,encoding='utf-8')
    sw.write_text(sws,encoding='utf-8')
    put(root/'release.json',{'id':tag})
def run(root=ROOT):
    from PIL import Image
    names=json.loads((root/'shared/MASTER_DATA.json').read_text(encoding='utf-8'))['ingredients']
    feat=root/'food_color_features.js'
    base=json.loads(feat.read_text(encoding='utf-8').split('=',1)[1].strip().rstrip(';'))
    added=[]
    folder=root/'assets/food-icons'
    for item in sorted(folder.glob('*.png')) if folder.exists() else []:
        key=item.stem
        if key not in names:raise ValueError('unknown ingredient key: '+key)
        with Image.open(item) as img:
            if img.format!='PNG':raise ValueError('food icon must be PNG')
            image=img.convert('RGBA')
            if not (4<=image.width<=1024 and 4<=image.height<=1024):raise ValueError('food icon dimensions')
            if image.getchannel('A').getextrema()[0]!=0 or image.getchannel('A').getextrema()[1]<200:
                raise ValueError('food sprite requires transparent background')
            image.thumbnail((48,48),Image.Resampling.LANCZOS)
            rendered={'w':image.width,'h':image.height,'rgba':list(image.tobytes())}
            if base['foods'].get(names[key])!=rendered:
                base['foods'][names[key]]=rendered
                added.append(key)
    if not added:return False
    text='window.POKESLEEP_FOOD_COLOR_FEATURES = '+json.dumps(base,ensure_ascii=False,separators=(',',':'))+';\n'
    receipt_path=root/'shared/master_release.json'
    receipt=json.loads(receipt_path.read_text(encoding='utf-8'))
    receipt['missingFoodTemplates']=sorted(set(names.values())-set(base['foods']))
    feat.write_text(text,encoding='utf-8')
    put(receipt_path,receipt)
    bump(root,'food-icons-'+hashlib.sha256(text.encode('utf-8')).hexdigest()[:16])
    print('REGISTERED_FOOD_ICONS:',added)
    return True
def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=pathlib.Path,default=ROOT)
    try:run(p.parse_args().root);return 0
    except (ValueError,KeyError,OSError,ImportError) as e:
        print('HOLD food icon registration:',e);return 2
if __name__=='__main__':raise SystemExit(main())
