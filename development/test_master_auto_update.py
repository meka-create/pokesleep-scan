#!/usr/bin/env python3
"""Two-species migration, failure-rollback, and future-release lifecycle fixtures."""
import copy, json, pathlib, tempfile, unittest, sys
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'development'))
import master_auto_update as master_sync
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
    def add_future_food(self, coefficient=None):
        data=self.dir/'src/i18n/ja/data.json'
        doc=json.loads(data.read_text(encoding='utf-8'))
        doc['ingredients']['futureFood']='未来の食材'
        save(data,doc)
        if coefficient is not None:
            strength=self.dir/'src/util/PokemonRp.ts'
            strength.write_text(strength.read_text(encoding='utf-8').replace(
                '  unknown:', f'  futureFood: {coefficient},\n  unknown:'),
                encoding='utf-8')
    def test_new_20th_ingredient_is_pending_even_when_upstream_coefficient_is_valid(self):
        self.add_future_food(123)
        new,report=project(self.dir,self.full,commit='a'*40)
        self.assertEqual(new['ingredients'],self.full['ingredients'])
        self.assertNotIn('ingredientStrength',new)
        self.assertEqual(report['newIngredients'],[])
        self.assertEqual(report['pendingIngredients'],['futureFood'])
        self.assertFalse(report['changed'])
        # An unrelated installed-species adjustment is still publishable.
        src=self.dir/'src/data/pokemon.json'
        doc=json.loads(src.read_text(encoding='utf-8'))
        doc[0]['frequency']+=2
        save(src,doc)
        updated,report=project(self.dir,self.full,commit='a'*40)
        self.assertTrue(report['changed'])
        self.assertEqual(updated['ingredients'],self.full['ingredients'])
        self.assertEqual(report['pendingIngredients'],['futureFood'])
    def test_new_ingredient_zero_or_missing_coefficient_never_blocks_old_updates(self):
        for value in (None,0):
            make_fixture(self.dir,self.full)
            self.add_future_food(value)
            updated,report=project(self.dir,self.full,commit='a'*40)
            self.assertFalse(report['changed'])
            self.assertEqual(report['pendingIngredients'],['futureFood'])
    def test_explicit_approval_still_requires_positive_verified_coefficient(self):
        self.add_future_food(0)
        with patch.object(master_sync,'APPROVED_NEW_INGREDIENTS',frozenset({'futureFood'})):
            with self.assertRaisesRegex(Hold,'approved ingredient requires'):
                project(self.dir,self.full,commit='a'*40)
        self.add_future_food(123)
        with patch.object(master_sync,'APPROVED_NEW_INGREDIENTS',frozenset({'futureFood'})):
            new,report=project(self.dir,self.full,commit='a'*40)
            self.assertEqual(report['newIngredients'],['futureFood'])
            self.assertEqual(report['pendingIngredients'],[])
            self.assertEqual(new['ingredients']['futureFood'],'未来の食材')
            self.assertEqual(new['ingredientStrength']['futureFood'],123)
            again,status=project(self.dir,new,commit='a'*40)
            self.assertFalse(status['changed'])
            self.assertEqual(again['ingredientStrength']['futureFood'],123)
    def test_future_species_using_unapproved_food_deferred_while_safe_species_updates(self):
        self.add_future_food(0)
        src=self.dir/'src/data/pokemon.json'
        rows=json.loads(src.read_text(encoding='utf-8'))
        newcomer=next(p for p in rows if p['name']=='Foongus')
        newcomer['ing1']['name']='futureFood'
        rows[0]['frequency']+=2
        save(src,rows)
        projected,report=project(self.dir,self.pre,commit='a'*40)
        self.assertNotIn('futureFood',projected['ingredients'])
        self.assertIn('Amoonguss',report['addedSpecies'])
        self.assertNotIn('Foongus',report['addedSpecies'])
        self.assertEqual(next(x for x in report['deferredSpecies'] if x['name']=='Foongus')['reason'],'provisional-data')
        self.assertIn(rows[0]['name'],report['changedSpecies'])
    def test_installed_species_referencing_unapproved_food_blocks_unsafe_change(self):
        self.add_future_food(0)
        src=self.dir/'src/data/pokemon.json'
        rows=json.loads(src.read_text(encoding='utf-8'))
        rows[0]['ing1']['name']='futureFood'
        save(src,rows)
        with self.assertRaisesRegex(Hold,'installed species requires an unapproved'):
            project(self.dir,self.full,commit='a'*40)

    def test_bad_numeric_upstream_holds_release(self):
        src=self.dir/'src/data/pokemon.json'
        doc=json.loads(src.read_text(encoding='utf-8'))
        doc[0]['ingRate']='invalid'
        save(src,doc)
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)

    def test_missing_required_food_count_holds_release(self):
        src=self.dir/'src/data/pokemon.json'
        doc=json.loads(src.read_text(encoding='utf-8'))
        doc[0]['ing1']['c1']=None
        save(src,doc)
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)

    def test_duplicate_food_display_names_hold_release(self):
        src=self.dir/'src/i18n/ja/data.json'
        doc=json.loads(src.read_text(encoding='utf-8'))
        doc['ingredients']['milk']=doc['ingredients']['apple']
        save(src,doc)
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)

    def test_existing_species_statistics_update_without_separate_approval(self):
        src=self.dir/'src/data/pokemon.json'
        data=json.loads(src.read_text(encoding='utf-8'))
        data[0]['frequency']+=2
        save(src,data)
        updated,report=project(self.dir,self.full,commit='a'*40)
        self.assertTrue(report['changed'])
        self.assertIn(data[0]['name'],report['changedSpecies'])

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
            'speciesCount':len(original['pokemon']),'ingredientCount':20,'natureCount':25,
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
        self.assertEqual(len(self.pre['pokemon']),len(self.full['pokemon'])-2)
    def test_subskill_structure_change_fails_closed(self):
        sub=self.dir/'src/util/SubSkill.ts'
        sub.write_text(sub.read_text(encoding='utf-8').replace('subSkillNames','deprecatedSkillNames'),encoding='utf-8')
        with self.assertRaises(Hold):
            project(self.dir,self.pre,commit='a'*40)

class FutureSpeciesReadinessTest(unittest.TestCase):
    """Use the *real* importer with synthetic data, without writing production master."""
    def setUp(self):
        import datetime
        self.date = datetime.date
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.prior = json.loads((ROOT/'shared/MASTER_DATA.json').read_text(encoding='utf-8'))
        self.assertGreaterEqual(len(self.prior['pokemon']), 249)
        extended = copy.deepcopy(self.prior)
        for key,ja in [('SyntheticArrivalAlpha','監査用ミライA'),('SyntheticArrivalBeta','監査用ミライB')]:
            template = copy.deepcopy(next(x for x in self.prior['pokemon'] if x['name']=='ピカチュウ'))
            template.update({'name':ja,'name_en':key,'arrival':'2026-10-26','type':'ghost',
                             'skill':'Cooking Advance S (Mystical Fire)',
                             'mainSkill':'マジカルフレイム (料理アドバンスS)'})
            extended['pokemon'].append(template)
        self.assertEqual(len(extended['pokemon']),len(self.prior['pokemon'])+2)
        make_fixture(self.root,extended)
    def source(self):
        return self.root/'src/data/pokemon.json'
    def edit(self,callback):
        p=self.source()
        data=json.loads(p.read_text(encoding='utf-8'))
        callback(data)
        save(p,data)
    def project_at(self,day,prior=None):
        return project(self.root,prior or self.prior,commit='a'*40,
                       today_jst=self.date.fromisoformat(day))
    def test_before_arrival_complete_data_does_not_publish_new_species(self):
        master,report=self.project_at('2026-10-25')
        self.assertFalse(report['changed'])
        self.assertEqual(len(master['pokemon']),len(self.prior['pokemon']))
        self.assertEqual({x['name'] for x in report['deferredSpecies']},
                         {'SyntheticArrivalAlpha','SyntheticArrivalBeta'})
        self.assertEqual({x['reason'] for x in report['deferredSpecies']},
                         {'before-arrival'})
        self.assertEqual(report['overdueNewSpecies'],[])
    def test_on_arrival_complete_data_imports_251_with_new_skill(self):
        master,report=self.project_at('2026-10-26')
        self.assertTrue(report['changed'])
        self.assertEqual(len(master['pokemon']),len(self.prior['pokemon'])+2)
        self.assertEqual(set(report['addedSpecies']),{'SyntheticArrivalAlpha','SyntheticArrivalBeta'})
        self.assertEqual(report['deferredSpecies'],[])
        old={x['name_en']:x for x in self.prior['pokemon']}
        new={x['name_en']:x for x in master['pokemon']}
        self.assertTrue(all(new[name]==value for name,value in old.items()))
        self.assertEqual(new['SyntheticArrivalAlpha']['mainSkill'],'マジカルフレイム (料理アドバンスS)')
        _,repeat=self.project_at('2026-10-27',prior=master)
        self.assertFalse(repeat['changed'])
    def test_after_arrival_provisional_zero_unknown_keeps_only_new_species_deferred(self):
        def change(data):
            for x in data[-2:]:
                x.update(frequency=0,carryLimit=0,specialty='unknown')
                x['ing1']={'name':'unknown1','c1':1,'c2':2,'c3':4}
        self.edit(change)
        master,report=self.project_at('2026-10-26')
        self.assertFalse(report['changed'])
        self.assertEqual(len(master['pokemon']),len(self.prior['pokemon']))
        self.assertEqual({x['reason'] for x in report['deferredSpecies']},{'provisional-data'})
        self.assertEqual(set(report['overdueNewSpecies']),{'SyntheticArrivalAlpha','SyntheticArrivalBeta'})
    def test_after_arrival_one_ready_other_placeholder_partial_then_later_import(self):
        def change(data):
            x=data[-1]
            x['carryLimit']=0
            x['ing2']={'name':'unknown2','c2':0,'c3':0}
        self.edit(change)
        partial,report=self.project_at('2026-10-26')
        self.assertEqual(len(partial['pokemon']),len(self.prior['pokemon'])+1)
        self.assertEqual(report['addedSpecies'],['SyntheticArrivalAlpha'])
        self.assertEqual([x['name'] for x in report['deferredSpecies']],['SyntheticArrivalBeta'])
        self.assertEqual(report['overdueNewSpecies'],['SyntheticArrivalBeta'])
        self.edit(lambda data:data.__setitem__(-1,{**data[-1], 'carryLimit':22,
                      'ing2':{'name':'mushroom','c2':1,'c3':2}}))
        complete,report2=self.project_at('2026-10-27',prior=partial)
        self.assertEqual(len(complete['pokemon']),len(self.prior['pokemon'])+2)
        self.assertEqual(report2['addedSpecies'],['SyntheticArrivalBeta'])
    def test_existing_species_corruption_is_not_silenced_by_future_deferral(self):
        self.edit(lambda data:data[0].update(frequency=0))
        with self.assertRaisesRegex(Hold,'invalid pokemon statistics'):
            self.project_at('2026-10-25')
    def test_future_duplicate_identity_and_invalid_date_are_not_silenced(self):
        def dup(data): data[-1]['id']=data[-2]['id']
        self.edit(dup)
        with self.assertRaisesRegex(Hold,'collision'):
            self.project_at('2026-10-25')
        # Regenerate the extended source separately for the calendar check.
        model=copy.deepcopy(self.prior)
        p=copy.deepcopy(self.prior['pokemon'][0])
        p.update(name_en='SyntheticArrivalAlpha',name='監査用ミライA',arrival='2026-02-30')
        model['pokemon'].append(p)
        make_fixture(self.root,model)
        with self.assertRaisesRegex(Hold,'arrival date'):
            self.project_at('2026-10-25')
    def test_completed_original_species_revision_still_publishes_while_future_deferred(self):
        self.edit(lambda data:data[0].update(frequency=data[0]['frequency']+2))
        projected,report=self.project_at('2026-10-25')
        self.assertEqual(len(projected['pokemon']),len(self.prior['pokemon']))
        self.assertIn(self.prior['pokemon'][0]['name_en'],report['changedSpecies'])
        self.assertTrue(report['changed'])


    def test_after_release_partial_identity_and_food_placeholders_are_deferred(self):
        def make_pending(data):
            p=data[-1]
            p['ing2']=None
            p['ing3']={'name':'unknown3','c3':0}
        self.edit(make_pending)
        partial,report=self.project_at('2026-10-26')
        self.assertEqual(report['addedSpecies'],['SyntheticArrivalAlpha'])
        self.assertEqual([x['name'] for x in report['deferredSpecies']],['SyntheticArrivalBeta'])
        self.assertEqual(len(partial['pokemon']),len(self.prior['pokemon'])+1)
        self.edit(lambda data:data[-1].update(ing2={'name':'milk','c2':2,'c3':3},
                                              ing3={'name':'honey','c3':3}))
        full,report2=self.project_at('2026-10-27',prior=partial)
        self.assertEqual(report2['addedSpecies'],['SyntheticArrivalBeta'])
        self.assertEqual(len(full['pokemon']),len(self.prior['pokemon'])+2)
    def test_new_species_pending_translation_or_unregistered_skill_does_not_block_old_updates(self):
        names=self.root/'src/i18n/ja/pokemons.json'
        labels=json.loads(names.read_text(encoding='utf-8'))
        del labels['pokemons']['SyntheticArrivalBeta']
        save(names,labels)
        self.edit(lambda data:data[-1].update(skill='Unreleased Special Skill'))
        self.edit(lambda data:data[0].update(frequency=data[0]['frequency']+2))
        master,report=self.project_at('2026-10-26')
        self.assertIn(self.prior['pokemon'][0]['name_en'],report['changedSpecies'])
        self.assertEqual(report['addedSpecies'],['SyntheticArrivalAlpha'])
        self.assertEqual([x['name'] for x in report['deferredSpecies']],['SyntheticArrivalBeta'])
        self.assertEqual(len(master['pokemon']),len(self.prior['pokemon'])+1)
        # A source-only name alias does not corrupt the installed form. The
        # ambiguous newcomer remains deferred, not silently published.
        labels['pokemons']['SyntheticArrivalBeta']=self.prior['pokemon'][0]['name']
        save(names,labels)
        projected,report=self.project_at('2026-10-26')
        self.assertEqual(report['addedSpecies'],['SyntheticArrivalAlpha'])
        self.assertEqual(report['deferredSpecies'][0]['reason'],'ambiguous-translation')
        self.assertEqual(report['overdueNewSpecies'],['SyntheticArrivalBeta'])
        self.assertIn(self.prior['pokemon'][0]['name_en'],
                      {p['name_en'] for p in projected['pokemon']})
    def make_equivalent_existing_form_alias(self):
        # Production-like same-ID, distinct form and arrival. No private
        # screenshot, nickname or Golden data involved.
        names=self.root/'src/i18n/ja/pokemons.json'
        labels=json.loads(names.read_text(encoding='utf-8'))
        source=self.source()
        rows=json.loads(source.read_text(encoding='utf-8'))
        old=next(x for x in rows if x['name']=='Pikachu (Halloween)')
        old['form']='Halloween'
        new=rows[-1]
        new.clear()
        new.update(copy.deepcopy(old))
        new.update(name='SyntheticArrivalBeta',
                   form='Halloween2',arrival='2026-10-26')
        self.assertEqual(new['id'],old['id'])
        self.assertNotEqual(new['form'],old['form'])
        save(source,rows)
        labels['pokemons']['SyntheticArrivalBeta']=labels['pokemons']['Pikachu (Halloween)']
        save(names,labels)

    def test_same_label_same_numeric_and_ingredient_data_is_verified_alias_not_overdue(self):
        self.make_equivalent_existing_form_alias()
        projected,report=self.project_at('2026-10-26')
        self.assertEqual(report['addedSpecies'],['SyntheticArrivalAlpha'])
        self.assertEqual(report['deferredSpecies'],[])
        self.assertEqual(report['overdueNewSpecies'],[])
        self.assertEqual(report['overdueReasons'],[])
        self.assertEqual(report['equivalentAliases'],[{
            'name':'SyntheticArrivalBeta','canonical':'Pikachu (Halloween)',
            'arrival':'2026-10-26'}])
        # No ambiguous name enters the CSV and the existing imported row
        # retains its spelling and all numeric values, even on the next day.
        old=next(x for x in self.prior['pokemon'] if x['name_en']=='Pikachu (Halloween)')
        unchanged=next(x for x in projected['pokemon'] if x['name_en']==old['name_en'])
        self.assertEqual(old,unchanged)
        self.assertEqual(len({x['name'] for x in projected['pokemon']}),len(projected['pokemon']))
        self.assertNotIn('SyntheticArrivalBeta',{x['name_en'] for x in projected['pokemon']})
        again,later=self.project_at('2026-10-27',prior=projected)
        self.assertFalse(later['changed'])
        self.assertEqual(later['equivalentAliases'],report['equivalentAliases'])

    def test_unsafe_same_label_variations_still_defer_with_overdue_reason(self):
        self.make_equivalent_existing_form_alias()
        original=json.loads(self.source().read_text(encoding='utf-8'))
        # Same label is NOT sufficient: different stats, food, ID, identity,
        # missing gameplay fields, or unknown new metadata all mean
        # equivalence has not been demonstrated.
        def mutate_frequency(rows):rows[-1]['frequency']+=1
        def mutate_food(rows):rows[-1]['ing2']['c2']+=1
        def mutate_id(rows):rows[-1]['id']=max(x['id'] for x in rows)+500
        def mutate_form(rows):rows[-1]['form']=''
        def mutate_original_form(rows):
            next(x for x in rows if x['name']=='Pikachu (Halloween)')['form']=''
        def mutate_gameplay_field(rows):rows[-1]['unreviewedNewStat']=1
        def mutate_japanese_label(rows):rows[-1]['ja']='新しい識別可能な衣装名'
        def mutate_old_japanese_label(rows):
            next(x for x in rows if x['name']=='Pikachu (Halloween)')['ja']='旧衣装'
        def mutate_placeholder(rows):rows[-1]['carryLimit']=0
        for mutate in (mutate_frequency,mutate_food,mutate_id,
                       mutate_form,mutate_original_form,
                       mutate_gameplay_field,mutate_japanese_label,
                       mutate_old_japanese_label,mutate_placeholder):
            rows=copy.deepcopy(original)
            mutate(rows)
            save(self.source(),rows)
            projected,report=self.project_at('2026-10-26')
            self.assertEqual(report['equivalentAliases'],[],mutate.__name__)
            self.assertEqual(report['overdueNewSpecies'],['SyntheticArrivalBeta'],mutate.__name__)
            self.assertEqual(len(projected['pokemon']),len(self.prior['pokemon'])+1,
                             mutate.__name__)
            self.assertIn(report['deferredSpecies'][0]['reason'],
                          ('ambiguous-translation','provisional-data'),mutate.__name__)
        save(self.source(),original)

    def test_alias_never_masks_missing_installed_species_or_bad_identifier(self):
        self.make_equivalent_existing_form_alias()
        rows=json.loads(self.source().read_text(encoding='utf-8'))
        rows=[x for x in rows if x['name']!='Pikachu (Halloween)']
        save(self.source(),rows)
        with self.assertRaisesRegex(Hold,'species deletion'):
            self.project_at('2026-10-26')

    def test_new_alias_collision_deferred_while_old_updates_and_new_unique_species_publish(self):
        names=self.root/'src/i18n/ja/pokemons.json'
        labels=json.loads(names.read_text(encoding='utf-8'))
        labels['pokemons']['SyntheticArrivalBeta']=self.prior['pokemon'][0]['name']
        save(names,labels)
        self.edit(lambda data:data[0].update(frequency=data[0]['frequency']+2))
        updated,report=self.project_at('2026-10-26')
        self.assertIn(self.prior['pokemon'][0]['name_en'],report['changedSpecies'])
        self.assertEqual(report['addedSpecies'],['SyntheticArrivalAlpha'])
        self.assertEqual([x['name'] for x in report['deferredSpecies']],['SyntheticArrivalBeta'])
        self.assertEqual(report['deferredSpecies'][0]['reason'],'ambiguous-translation')
        self.assertEqual(report['overdueNewSpecies'],['SyntheticArrivalBeta'])
        self.assertEqual(len(updated['pokemon']),len(self.prior['pokemon'])+1)
        self.assertEqual(next(x for x in updated['pokemon'] if x['name_en']==self.prior['pokemon'][0]['name_en'])['name'],
                         self.prior['pokemon'][0]['name'])
        labels['pokemons']['SyntheticArrivalBeta']='監査用ミライB'
        save(names,labels)
        completed,final=self.project_at('2026-10-27',prior=updated)
        self.assertEqual(final['addedSpecies'],['SyntheticArrivalBeta'])
        self.assertEqual(len(completed['pokemon']),len(self.prior['pokemon'])+2)

    def test_two_new_source_names_with_one_japanese_label_both_defer(self):
        names=self.root/'src/i18n/ja/pokemons.json'
        labels=json.loads(names.read_text(encoding='utf-8'))
        labels['pokemons']['SyntheticArrivalBeta']='監査用ミライA'
        save(names,labels)
        projected,report=self.project_at('2026-10-26')
        self.assertEqual(len(projected['pokemon']),len(self.prior['pokemon']))
        self.assertEqual(set(x['name'] for x in report['deferredSpecies']),
                         {'SyntheticArrivalAlpha','SyntheticArrivalBeta'})
        self.assertEqual({x['reason'] for x in report['deferredSpecies']},
                         {'ambiguous-translation'})

    def test_collision_between_two_installed_japanese_names_still_holds(self):
        names=self.root/'src/i18n/ja/pokemons.json'
        labels=json.loads(names.read_text(encoding='utf-8'))
        first,second=self.prior['pokemon'][:2]
        labels['pokemons'][second['name_en']]=first['name']
        save(names,labels)
        with self.assertRaisesRegex(Hold,'collision'):
            self.project_at('2026-10-26')

    def test_historical_placeholder_does_not_raise_future_release_warning(self):
        # Upstream may retroactively append incomplete forms with years-old
        # arrival. They remain deferred but must not show update-failed UI.
        def make_historical(data):
            older=data[-2]
            older.update(arrival='2023-07-17',frequency=0,
                         carryLimit=0,skill='unknown')
        self.edit(make_historical)
        master,report=self.project_at('2026-10-17')
        self.assertEqual(len(master['pokemon']),len(self.prior['pokemon']))
        self.assertEqual(report['addedSpecies'],[])
        self.assertEqual({x['name'] for x in report['deferredSpecies']},
                         {'SyntheticArrivalAlpha','SyntheticArrivalBeta'})
        self.assertEqual(report['overdueNewSpecies'],[])
    def test_same_arrival_date_as_installed_cutoff_still_warns(self):
        # Once the first October 26 species imports, cutoff becomes Oct26.
        # The second same-day species must still be tracked as overdue.
        self.edit(lambda data:data[-1].update(carryLimit=0))
        partial,_=self.project_at('2026-10-26')
        self.assertEqual(partial['cutoff'],'2026-10-26')
        after,report=self.project_at('2026-10-27',prior=partial)
        self.assertEqual(report['overdueNewSpecies'],['SyntheticArrivalBeta'])
        self.assertEqual(len(after['pokemon']),len(partial['pokemon']))
    def test_historical_placeholder_does_not_block_valid_existing_revision(self):
        self.edit(lambda data:data[-1].update(arrival='2023-07-17',
                    frequency=0,carryLimit=0,skill='unknown'))
        self.edit(lambda data:data[0].update(frequency=data[0]['frequency']+2))
        master,report=self.project_at('2026-10-17')
        self.assertTrue(report['changed'])
        self.assertEqual(report['overdueNewSpecies'],[])
        self.assertIn(self.prior['pokemon'][0]['name_en'],report['changedSpecies'])

    def test_after_251_promotion_further_new_species_still_automatically_imports(self):
        full,report=self.project_at('2026-10-26')
        self.assertEqual(len(full['pokemon']),len(self.prior['pokemon'])+2)
        next_master=copy.deepcopy(full)
        template=copy.deepcopy(next(p for p in full['pokemon'] if p['name']=='ピカチュウ'))
        template.update(name_en='SyntheticArrivalGamma',name='監査用ミライC',
                        arrival='2026-11-09')
        next_master['pokemon'].append(template)
        make_fixture(self.root,next_master)
        before,_=project(self.root,full,commit='a'*40,
                         today_jst=self.date(2026,11,8))
        self.assertEqual(len(before['pokemon']),len(full['pokemon']))
        at,report2=project(self.root,full,commit='a'*40,
                           today_jst=self.date(2026,11,9))
        self.assertEqual(report2['addedSpecies'],['SyntheticArrivalGamma'])
        self.assertEqual(len(at['pokemon']),len(full['pokemon'])+1)

if __name__=='__main__': unittest.main()
