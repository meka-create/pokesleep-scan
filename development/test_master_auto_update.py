#!/usr/bin/env python3
"""Synthetic October 5, 2026 247 -> 249 migration and failure-rollback fixture."""
import copy, json, pathlib, tempfile, unittest, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'development'))
from master_auto_update import project, Hold, BASE_FOOD_STRENGTH
def save(p,x):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(x,ensure_ascii=False),encoding='utf-8')
def make_fixture(root,master):
    pk=[];translations={};skills={}
    for i,p in enumerate(master['pokemon'],1):
        x={'id':i,'name':p['name_en'],'skill':p['skill'],**{k:p[k] for k in (
           'arrival','frequency','carryLimit','ingRate','skillRate',
           'evolutionCount','evolutionLeft','specialty','type')}}
        translations[p['name_en']]=p['name']
        skills[p['skill']]={'name':p['mainSkill']}
        for n in ('ing1','ing2','ing3'):
            v=p.get(n)
            x[n]=None if v is None else {'name':v['key'],**{q:v.get(q) for q in ('c1','c2','c3')}}
        if p.get('mythIng'):
            x['mythIng']=[{'name':v['key'],**{q:v.get(q) for q in ('c1','c2','c3')}} for v in p['mythIng']]
        pk.append(x)
    save(root/'src/data/pokemon.json',pk)
    save(root/'src/i18n/ja/pokemons.json',{'pokemons':translations})
    save(root/'src/i18n/ja/skills.json',{'skills':skills})
    save(root/'src/i18n/ja/data.json',{'ingredients':master['ingredients'],
             'natures':{n['en']:n['ja'] for n in master['natures']},
             'subskill':{n['en']:n['ja'] for n in master['subskills']}})
    vals=[s['en'] for s in master['subskills']]
    assert len(vals)==17
    groups=[('GoldSubSkillType','goldSubSkillNames',vals[:7]),
            ('BlueSubSkillType','blueSubSkillNames',vals[7:13]),
            ('WhiteSubSkillType','whiteSubSkillNames',vals[13:])]
    code=''
    for ty,_,v in groups:
        code+='type '+ty+' = '+' | '.join('"'+x+'"' for x in v)+';\n'
    code+='export type SubSkillType = '+' | '.join(x[0] for x in groups)+';\n'
    code+='class SubSkill {\n'
    for ty,name,v in groups:
        code+='static '+name+': '+ty+'[] = ['+','.join('"'+x+'"' for x in v)+'];\n'
    code+='static subSkillNames: SubSkillType[] = ['+','.join('...this.'+x[1] for x in groups)+'];\n}\n'
    (root/'src/util').mkdir(parents=True,exist_ok=True)
    (root/'src/util/SubSkill.ts').write_text(code,encoding='utf-8')
    strengths={**BASE_FOOD_STRENGTH,**master.get('ingredientStrength',{})}
    strengths.update({'unknown':0,'unknown1':0,'unknown2':0,'unknown3':0})
    rp='export const ingredientStrength: { [ing in IngredientName]: number } = {\n'
    rp+=''.join(f'  {key}: {val},\n' for key,val in strengths.items())
    rp+='};\n'
    (root/'src/util/PokemonRp.ts').write_text(rp,encoding='utf-8')
class OctoberFifthTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.dir=pathlib.Path(self.tmp.name)
        self.full=json.loads((ROOT/'shared/MASTER_DATA.json').read_text(encoding='utf-8'))
        self.pre=copy.deepcopy(self.full)
        self.pre['pokemon']=[p for p in self.pre['pokemon'] if p['name'] not in ('タマゲタケ','モロバレル')]
        self.assertEqual(len(self.pre['pokemon']),len(self.full['pokemon'])-2)
        self.assertGreaterEqual(len(self.full['pokemon']),249)
        make_fixture(self.dir,self.full)
    def test_two_real_species_appear_without_other_species_loss(self):
        new,report=project(self.dir,self.pre,commit='a'*40)
        self.assertEqual(len(new['pokemon']),len(self.full['pokemon']))
        self.assertEqual(sorted(report['addedSpecies']),['Amoonguss','Foongus'])
        self.assertTrue(report['changed'])
        self.assertEqual({p['name'] for p in new['pokemon']},
                         {p['name'] for p in self.full['pokemon']})
        again,status=project(self.dir,new,commit='a'*40)
        self.assertFalse(status['changed'],'second run should be idempotent')
    def test_247_to_249_release_files_and_receipt(self):
        import shutil,hashlib
        from master_auto_update import promote
        root=self.dir/'live-release-test'
        (root/'shared').mkdir(parents=True,exist_ok=True)
        save(root/'shared/MASTER_DATA.json',self.pre)
        shutil.copy(ROOT/'app.js',root/'app.js')
        shutil.copy(ROOT/'sw.js',root/'sw.js')
        shutil.copy(ROOT/'release.json',root/'release.json')
        shutil.copy(ROOT/'food_color_features.js',root/'food_color_features.js')
        updated,report=project(self.dir,self.pre,commit='a'*40)
        self.assertTrue(promote(root,updated,report))
        actual_bytes=(root/'shared/MASTER_DATA.json').read_bytes()
        active=json.loads(actual_bytes)
        metadata=json.loads((root/'shared/master_release.json').read_text(encoding='utf-8'))
        release=json.loads((root/'release.json').read_text(encoding='utf-8'))['id']
        self.assertEqual(metadata['sha256'],hashlib.sha256(actual_bytes).hexdigest())
        self.assertEqual(metadata['sourceCommit'],'a'*40)
        self.assertEqual(metadata['speciesCount'],len(self.full['pokemon']))
        self.assertEqual(len(active['pokemon']),len(self.full['pokemon']))
        self.assertEqual(sorted(set(x['name'] for x in active['pokemon'])-
                                set(x['name'] for x in self.pre['pokemon'])),
                         ['タマゲタケ','モロバレル'])
        self.assertIn(release,(root/'app.js').read_text(encoding='utf-8'))
        self.assertIn(release,(root/'sw.js').read_text(encoding='utf-8'))
        _,second=project(self.dir,active,commit='a'*40)
        self.assertFalse(second['changed'],'auto updater should not endlessly republish the same master')
    def test_new_20th_ingredient_is_detected_not_guessed(self):
        data=pathlib.Path(self.dir/'src/i18n/ja/data.json')
        doc=json.loads(data.read_text(encoding='utf-8'))
        doc['ingredients']['futureFood']='未来の食材'
        save(data,doc)
        strength=self.dir/'src/util/PokemonRp.ts'
        strength.write_text(strength.read_text(encoding='utf-8').replace('  unknown:', '  futureFood: 123,\n  unknown:'),encoding='utf-8')
        new,report=project(self.dir,self.pre,commit='a'*40)
        self.assertIn('futureFood',report['newIngredients'])
        self.assertEqual(new['ingredients']['futureFood'],'未来の食材')
        self.assertEqual(new['ingredientStrength']['futureFood'],123)
    def test_new_ingredient_without_coefficients_holds_release(self):
        data=self.dir/'src/i18n/ja/data.json'
        doc=json.loads(data.read_text(encoding='utf-8'))
        doc['ingredients']['futureFood']='未来の食材'
        save(data,doc)
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)

    def test_energy_change_to_old_food_holds_release(self):
        src=self.dir/'src/util/PokemonRp.ts'
        src.write_text(src.read_text(encoding='utf-8').replace('  apple: 90,','  apple: 999,'),
                       encoding='utf-8')
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)

    def test_approved_sprite_is_registered_and_updates_receipt(self):
        from PIL import Image
        import shutil
        from register_food_icons import run
        temp_root=self.dir/'image-registry-test'
        (temp_root/'shared').mkdir(parents=True,exist_ok=True)
        (temp_root/'assets/food-icons').mkdir(parents=True,exist_ok=True)
        original=copy.deepcopy(self.full)
        original['ingredients']['futureFood']='未来の食材'
        save(temp_root/'shared/MASTER_DATA.json',original)
        save(temp_root/'shared/master_release.json',{
            'schema':1,'sourceRepo':'nitoyon/pokesleep-tool',
            'sourceCommit':'a'*40,'sha256':'a'*64,
            'speciesCount':249,'ingredientCount':20,'natureCount':25,
            'subskillCount':17,'cutoff':original['cutoff'],
            'missingFoodTemplates':['未来の食材']})
        shutil.copy(ROOT/'food_color_features.js',temp_root/'food_color_features.js')
        shutil.copy(ROOT/'app.js',temp_root/'app.js')
        shutil.copy(ROOT/'sw.js',temp_root/'sw.js')
        shutil.copy(ROOT/'release.json',temp_root/'release.json')
        img=Image.new('RGBA',(24,24),(0,0,0,0))
        for x in range(5,19):
            for y in range(5,19):
                img.putpixel((x,y),(140,90,40,255))
        img.save(temp_root/'assets/food-icons/futureFood.png')
        self.assertTrue(run(temp_root))
        new_source=(temp_root/'food_color_features.js').read_text(encoding='utf-8')
        d=json.loads(new_source.split('=',1)[1].strip().rstrip(';'))
        self.assertIn('未来の食材',d['foods'])
        receipt=json.loads((temp_root/'shared/master_release.json').read_text(encoding='utf-8'))
        self.assertNotIn('未来の食材',receipt['missingFoodTemplates'])
        self.assertTrue((temp_root/'release.json').read_text(encoding='utf-8').find('food-icons-')>=0)
        self.assertFalse(run(temp_root),'Repeated registration should be idempotent')
    def test_bad_source_rejected_before_writing_any_product_file(self):
        data=self.dir/'src/i18n/ja/data.json'
        doc=json.loads(data.read_text(encoding='utf-8'))
        del doc['ingredients']['mushroom']
        save(data,doc)
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)
        self.assertEqual(len(self.pre['pokemon']),247)
    def test_subskill_structure_change_fails_closed(self):
        sub=self.dir/'src/util/SubSkill.ts'
        sub.write_text(sub.read_text(encoding='utf-8').replace('subSkillNames','deprecatedSkillNames'),encoding='utf-8')
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)
if __name__=='__main__': unittest.main()
