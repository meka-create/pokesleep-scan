#!/usr/bin/env python3
"""Independent source-data importer for the OCR PWA. No AI Scan dependency.

Read-only upstream checkout -> validated master -> transactional git commit (CI).
Unknown structures or removal of previous selectable options cause HOLD.
"""
from __future__ import annotations
import argparse, hashlib, json, pathlib, re, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
INPUTS = {'pokemon':'src/data/pokemon.json','names':'src/i18n/ja/pokemons.json',
          'data':'src/i18n/ja/data.json','skills':'src/i18n/ja/skills.json',
          'subskill':'src/util/SubSkill.ts',
          'ingredientStrength':'src/util/PokemonRp.ts'}
FIELDS=('arrival','frequency','carryLimit','ingRate','skillRate',
        'evolutionCount','evolutionLeft','specialty','type')
class Hold(ValueError): pass
def check(condition,why):
    if not condition: raise Hold(why)
def read(path): return json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
def write(path,data):
    pathlib.Path(path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def digest(data): return hashlib.sha256(data).hexdigest()
def sha(repo):
    value=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
    check(bool(re.fullmatch('[0-9a-f]{40}',value)),'upstream SHA not pinned')
    return value
def selectable(code):
    code=re.sub(r'/\*.*?\*/|//[^\n]*','',code,flags=re.S)
    groups=[('GoldSubSkillType','goldSubSkillNames'),('BlueSubSkillType','blueSubSkillNames'),('WhiteSubSkillType','whiteSubSkillNames')]
    result=[]
    for typ,group in groups:
        t=re.search(r'\btype\s+'+typ+r'\s*=\s*(.*?);',code,re.S)
        g=re.search(r'\b'+group+r'\s*:\s*'+typ+r'\[\]\s*=\s*\[(.*?)\]\s*;',code,re.S)
        check(bool(t and g),'upstream subskill type structure changed')
        declared=re.findall(r'"([^"\n]+)"',t.group(1))
        values=re.findall(r'"([^"\n]+)"',g.group(1))
        check(bool(declared and declared==values),'subskill type/ordering mismatch')
        check(not re.sub(r'"[^"\n]+"|[|,\s]','',t.group(1)) and
              not re.sub(r'"[^"\n]+"|[|,\s]','',g.group(1)),'unknown subskill literals')
        result+=values
    u=re.search(r'export\s+type\s+SubSkillType\s*=\s*(.*?);',code,re.S)
    a=re.search(r'\bsubSkillNames\s*:\s*SubSkillType\[\]\s*=\s*\[(.*?)\]\s*;',code,re.S)
    check(bool(u and a),'subskill union/aggregate missing')
    check(re.findall(r'\b(?:GoldSubSkillType|BlueSubSkillType|WhiteSubSkillType)\b',u.group(1))==[x[0] for x in groups] and
          re.findall(r'\.\.\.this\.(\w+)',a.group(1))==[x[1] for x in groups] and
          len(set(result))==len(result),'subskill aggregation changed')
    return result
# Fixed coefficients are the independently reviewed legacy classifier values.
# Any upstream revision to existing coefficients must be audited rather than
# silently changing OCR's calculation and risking false-positive species.
BASE_FOOD_STRENGTH = {
    "leek":185,"mushroom":167,"egg":115,"potato":124,"apple":90,
    "herb":130,"sausage":103,"milk":98,"honey":101,"oil":121,
    "ginger":109,"tomato":110,"cacao":151,"tail":342,"soy":100,
    "corn":140,"coffee":153,"pumpkin":250,"avocado":162
}
def read_strength(source):
    block=re.search(r"export\s+const\s+ingredientStrength\s*:\s*\{[^}]+\}\s*=\s*\{(.*?)\}\s*;",
                    source,re.S)
    check(bool(block),"upstream ingredient coefficient layout changed")
    result={}
    for line in block.group(1).splitlines():
        part=line.strip()
        if not part:continue
        parsed=re.fullmatch(r"([a-zA-Z]\w*)\s*:\s*(\d+)\s*,?",part)
        check(bool(parsed),"unrecognized ingredient coefficient line")
        key,num=parsed.group(1),int(parsed.group(2))
        check(key not in result and 0<=num<=3000,"duplicate/out-of-range coefficient")
        result[key]=num
    check(all(result.get(k)==value for k,value in BASE_FOOD_STRENGTH.items()),
          "legacy ingredient energy changed; manual OCR recalibration required")
    return result

def project(src,prior,commit=None):
    src=pathlib.Path(src)
    paths={k:src/v for k,v in INPUTS.items()}
    check(all(p.is_file() for p in paths.values()),'missing upstream file')
    inp={k:(p.read_text(encoding='utf-8') if k in ('subskill','ingredientStrength') else read(p)) for k,p in paths.items()}
    pokemon=inp['pokemon'];names=inp['names']['pokemons'];jp=inp['data'];skills=inp['skills']['skills']
    ingredients=jp['ingredients'];natures=jp['natures'];ss=selectable(inp['subskill'])
    strengths=read_strength(inp['ingredientStrength'])
    newly_supported=set(ingredients)-set(BASE_FOOD_STRENGTH)
    check(all(k in strengths and strengths[k]>0 for k in newly_supported),
          'new ingredient requires a verified upstream energy coefficient')
    extra={k:strengths[k] for k in sorted(newly_supported)}
    old_n={x['en']:x for x in prior['natures']}
    old_s={x['en']:x for x in prior['subskills']}
    check(isinstance(pokemon,list) and len(pokemon)>=240 and
          isinstance(ingredients,dict) and len(ingredients)>=19 and
          isinstance(names,dict) and isinstance(skills,dict) and len(natures)==25 and len(ss)>=17,
          'upstream dataset incomplete')
    check(set(old_n)==set(natures) and set(old_s)==set(ss),'unknown subskill/nature coefficients')
    check(set(prior['ingredients']).issubset(ingredients),'ingredient removed')
    used_en=set();used_ja=set();used_ids=set();parsed=[]
    for p in pokemon:
        en=p['name'];ja=names.get(en);skill=p['skill'];ident=(p.get('id'),p.get('form') or '')
        check(en not in used_en and ja not in used_ja and
              isinstance(ja,str) and bool(ja) and ident not in used_ids and
              isinstance(ident[0],int) and ident[0]>0 and
              skill in skills and isinstance(skills[skill].get('name'),str),
              'pokemon identifier/translation collision')
        used_en.add(en);used_ja.add(ja);used_ids.add(ident)
        row={'name':ja,'name_en':en,'skill':skill,'mainSkill':skills[skill]['name']}
        for k in FIELDS:
            check(p.get(k) is not None,f'missing {en}.{k}')
            row[k]=p[k]
        check(isinstance(row['frequency'],(float,int)) and row['frequency']>0 and
              isinstance(row['carryLimit'],int) and row['carryLimit']>0,
              'invalid pokemon statistics')
        for n in (1,2,3):
            item=p.get('ing'+str(n))
            if item is None:
                check(n==3,'missing ingredient slot')
                row['ing3']=None
            else:
                k=item['name']
                check(k in ingredients or (p.get('mythIng') and k in ('unknown','unknown1','unknown2','unknown3')),
                      f'unknown ingredient {en}:{k}')
                row['ing'+str(n)]={'key':k,'name':ingredients.get(k,k),
                                  **{c:item.get(c) for c in ('c1','c2','c3')}}
        if p.get('mythIng'):
            row['mythIng']=[]
            for it in p['mythIng']:
                k=it['name']
                check(k in ingredients,'unknown mythical ingredient')
                row['mythIng'].append({'key':k,'name':ingredients[k],
                                       **{c:it.get(c) for c in ('c1','c2','c3')}})
        parsed.append(row)
    old_by={x['name_en']:x for x in prior['pokemon']}
    updated_by={x['name_en']:x for x in parsed}
    check(set(old_by).issubset(updated_by),'species deletion requires manual audit')
    check(all(n in jp['subskill'] and isinstance(jp['subskill'][n],str) for n in ss),
          'subskill translations incomplete')
    commit=commit or sha(src)
    master={'cutoff':max(p['arrival'] for p in parsed),
            'ingredients':dict(sorted(ingredients.items())),
            'natures':[{**old_n[k],'ja':v} for k,v in natures.items()],
            'pokemon':parsed,
            'subskills':[{**old_s[k],'ja':jp['subskill'][k]} for k in ss],
            'provenance':{'origin':'pokesleep-scan independent upstream data',
                          'upstream':'https://github.com/nitoyon/pokesleep-tool',
                          'sourceCommit':commit,
                          'sourceFilesSha256':{k:digest(p.read_bytes()) for k,p in paths.items()},
                          'verification':'source structure checked; real importer E2E in STEP 3'}}
    # Dynamic extras are included only when required; this keeps today's
    # 249-species / 19-ingredient source projection byte-equivalent.
    if extra:master['ingredientStrength']=extra
    signature=lambda m:{k:m.get(k) for k in ('cutoff','ingredients','natures','pokemon','subskills','ingredientStrength')}
    result={'sourceCommit':commit,
            'addedSpecies':sorted(set(updated_by)-set(old_by)),
            'changedSpecies':sorted(k for k in old_by if old_by[k]!=updated_by[k]),
            'newIngredients':sorted(set(ingredients)-set(prior['ingredients'])),
            'changed':signature(master)!=signature(prior)}
    return master,result
def known_food_images(root):
    js=(root/'food_color_features.js').read_text(encoding='utf-8')
    return set(json.loads(js.split('=',1)[1].strip().rstrip(';'))['foods'])
def promote(root,master,report):
    if not report['changed']: return False
    new_text=json.dumps(master,ensure_ascii=False,indent=2)+'\n'
    h=digest(new_text.encode('utf-8'))
    rel='master-'+report['sourceCommit'][:12]+'-'+h[:10]
    receipt={'schema':1,'sourceRepo':'nitoyon/pokesleep-tool',
             'sourceCommit':report['sourceCommit'],'sha256':h,
             'speciesCount':len(master['pokemon']),
             'ingredientCount':len(master['ingredients']),
             'natureCount':len(master['natures']),
             'subskillCount':len(master['subskills']),
             'cutoff':master['cutoff'],
             'missingFoodTemplates':sorted(set(master['ingredients'].values())-known_food_images(root)),
             'updateMode':'independent-same-repository'}
    # Preflight every replacement before mutating source files.
    targets=[
        ('app.js',[(r"const BUILD_ID='[^']+'","const BUILD_ID='v12-"+rel+"'"),
                   (r"CHECKPOINT_RELEASE_ID='[^']+'","CHECKPOINT_RELEASE_ID='"+rel+"'"),
                   (r"version:'v12-[^']+'","version:'v12-"+rel+"'")]),
        ('sw.js',[(r"const RELEASE_ID = '[^']+';","const RELEASE_ID = '"+rel+"';")])]
    patches={}
    for name,rules in targets:
        s=(root/name).read_text(encoding='utf-8')
        for pattern,repl in rules:
            s,n=re.subn(pattern,lambda m:repl,s,count=1)
            check(n==1,'missing release token '+pattern)
        patches[name]=s
    # Changes are committed atomically by Actions after test success.
    (root/'shared/MASTER_DATA.json').write_text(new_text,encoding='utf-8')
    write(root/'shared/master_release.json',receipt)
    for file,content in patches.items(): (root/file).write_text(content,encoding='utf-8')
    write(root/'release.json',{'id':rel})
    return True
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--upstream',type=pathlib.Path,required=True)
    p.add_argument('--root',type=pathlib.Path,default=ROOT)
    p.add_argument('--apply',action='store_true')
    a=p.parse_args()
    try:
        master,diff=project(a.upstream,read(a.root/'shared/MASTER_DATA.json'))
        print(json.dumps(diff,ensure_ascii=False))
        if a.apply and promote(a.root,master,diff):print('PROMOTED: independent master; no AI Scan involvement')
        return 0
    except (Hold,ValueError,KeyError,TypeError,OSError,subprocess.CalledProcessError) as e:
        print('HOLD: previous master retained:',str(e))
        return 2
if __name__=='__main__':raise SystemExit(main())
