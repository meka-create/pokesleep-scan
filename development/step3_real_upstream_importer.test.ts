/**
 * STEP 3: call the REAL nitoyon/pokesleep-tool CSV importer.
 * The CI workflow copies this test into a newly cloned upstream src/util/Formatter
 * directory and runs upstream Vitest. Only synthetic Pokémon rows from the
 * public independent master are used: no Golden/diagnostics/screenshots.
 * The upstream source (not an imitation) handles CSV, Japanese aliases,
 * translated reverse lookups, PokemonIv construction and warnings.
 */
import { readFileSync } from "node:fs";
import type { TFunction } from "i18next";
import { describe, expect, test } from "vitest";
import ivLabels from "../../i18n/ja/IvCalc.json";
import jaData from "../../i18n/ja/data.json";
import jaNames from "../../i18n/ja/pokemons.json";
import jaSkills from "../../i18n/ja/skills.json";
import { importFromCsvTsv, detectFormat } from "./BoxImporter";
import { exportToCsvTsv } from "./BoxExporter";
import { escapeCsvField } from "./CsvFormatter";
import PokemonBox from "../Box/PokemonBox";

type Food={key:string;name:string;c1:number|null;c2:number|null;c3:number|null};
type Species={name:string;name_en:string;skill:string;mainSkill:string;ing1:Food;ing2:Food;ing3:Food|null;mythIng?:Food[]};
type Master={pokemon:Species[];natures:{en:string;ja:string}[];subskills:{en:string;ja:string}[];ingredients:Record<string,string>};
const location=process.env.SCAN_MASTER_PATH;
if(!location)throw Error("SCAN_MASTER_PATH must refer to public shared/MASTER_DATA.json");
const master:Master=JSON.parse(readFileSync(location,"utf8"));

const t=((key:string,opts?:Record<string,unknown>)=>{
  if(key==="ing n")return "食材"+String(opts?.n??"");
  if(key.startsWith("pokemons."))return (jaNames as any).pokemons?.[key.slice(9)]??key;
  if(key.startsWith("natures."))return (jaData as any).natures?.[key.slice(8)]??key;
  if(key.startsWith("subskill."))return (jaData as any).subskill?.[key.slice(9)]??key;
  if(key.startsWith("ingredients."))return (jaData as any).ingredients?.[key.slice(12)]??key;
  if(key.startsWith("skills.")&&key.endsWith(".name"))return (jaSkills as any).skills?.[key.slice(7,-5)]?.name??key;
  return (jaData as any)[key]??(ivLabels as any)[key]??key;
}) as TFunction;
const header=["ニックネーム","ポケモン","レベル","スキルレベル","食材1","食材2","食材3",
 "メインスキル","せいかく","まっしろミント","Lv10","Lv25","Lv50","Lv70","Lv80","一緒に眠った時間","色違い","お気に入り"];
function food(p:Species,slot:1|2|3):string{
  const choices=p.mythIng??[p.ing1,p.ing2,p.ing3].filter(Boolean) as Food[];
  // for ordinary species the first ingredient is legal at all three slots
  return choices.find(i=>Number(i["c"+slot])>0)?.name??"";
}
function row(p:Species,i:number):string[]{
 const specialNature=p.name==="ストリンダー (ハイ)"?"いじっぱり":"てれや";
 const mainSkill=p.skill==="Versatile"?"ゆめのかけらゲットS (ランダム)":p.mainSkill;
 return ["STEP3-"+i,p.name,"30","1",food(p,1),food(p,2),food(p,3),
  mainSkill,specialNature,"0",...master.subskills.slice(0,5).map(s=>s.ja),"0","0",""];
}
function serialize(lines:string[][]):string{return lines.map(cols=>cols.map(escapeCsvField).join(",")).join("\n");}

describe("real upstream Japanese CSV importer, generated from the live independent master",()=>{
 test("all existing species import with zero warnings and full row identity",()=>{
  expect(PokemonBox.maxEntryCount).toBeGreaterThanOrEqual(249);
  const data=[header,...master.pokemon.map(row)];
  expect(data.length).toBe(master.pokemon.length+1);
  expect(data.every(x=>x.length===18)).toBe(true);
  const csv=serialize(data);
  expect(detectFormat(csv)).toBe("csv");
  const parsed=importFromCsvTsv(csv,"csv",t);
  expect(parsed.warnings).toEqual([]);
  expect(parsed.items).toHaveLength(master.pokemon.length);
  for(let i=0;i<parsed.items.length;i++){
   expect(parsed.items[i].nickname).toBe(data[i+1][0]);
   expect((jaNames as any).pokemons[parsed.items[i].iv.pokemonName]).toBe(data[i+1][1]);
   expect(parsed.items[i].iv.level).toBe(30);
   expect(parsed.items[i].iv.skillLevel).toBe(1);
  }
 });
 test("all 25 Japanese natures and 17 subskills import without warnings",()=>{
  const pikachu=master.pokemon.find(x=>x.name==="ピカチュウ");
  expect(pikachu).toBeDefined();
  const rows=master.natures.map((nature,i)=>{
   const r=row(pikachu!,i);
   r[8]=nature.ja;
   r.splice(10,5,...[0,1,2,3,4].map(j=>master.subskills[(i+j)%master.subskills.length].ja));
   return r;
  });
  const result=importFromCsvTsv(serialize([header,...rows]),"csv",t);
  expect(result.warnings).toEqual([]);
  expect(result.items).toHaveLength(master.natures.length);
 });
 test("quoted commas, quotes, Unicode, punctuation, and blank mythical fields survive",()=>{
  const pokemon=master.pokemon.find(p=>p.name==="ミュウ");
  const darkrai=master.pokemon.find(p=>p.name==="ダークライ");
  expect(pokemon).toBeDefined();expect(darkrai).toBeDefined();
  const a=row(pokemon!,1),b=row(darkrai!,2);
  a[0]='「うた,"まる"」';
  // Optional mystical ingredient and subskill cells must be blank, not an em dash
  a[6]="";a[14]="";
  b[5]="";b[6]="";b[13]="";b[14]="";
  const result=importFromCsvTsv(serialize([header,a,b]),"csv",t);
  expect(result.warnings).toEqual([]);
  expect(result.items).toHaveLength(2);
  expect(result.items[0].nickname).toBe(a[0]);
  expect(result.items[1].nickname).toBe(b[0]);
 });
 test("unrecognized species, nature, or subskill never silently becomes an imported item",()=>{
  const p=master.pokemon.find(p=>p.name==="ピカチュウ")!;
  const data=[row(p,1),row(p,2),row(p,3)];
  data[0][1]="未実装種族";
  data[1][8]="未実装せいかく";
  data[2][10]="未実装サブスキル";
  const result=importFromCsvTsv(serialize([header,...data]),"csv",t);
  expect(result.items).toHaveLength(0);
  expect(result.warnings).toHaveLength(3);
 });
});

describe("2026-10-29 Neutralizing Mint 18-column import and round trip",()=>{
 test("original natures and mint flags survive real upstream importer and exporter",()=>{
  const cases:[string,string,boolean][]=[
   ["ピカチュウ","いじっぱり",true],
   ["ピカチュウ","おだやか",false],
   ["エレズン","いじっぱり",true],
   ["ストリンダー (ハイ)","いじっぱり",true],
   ["ストリンダー (ロー)","おだやか",true],
   ["ピカチュウ","てれや",false]
  ];
  const rows=cases.map(([species,nature,mint],i)=>{
   const p=master.pokemon.find(p=>p.name===species)!;
   const r=row(p,900+i);r[8]=nature;r[9]=mint?"1":"0";return r;
  });
  const imported=importFromCsvTsv(serialize([header,...rows]),"csv",t);
  expect(imported.warnings).toEqual([]);
  expect(imported.items).toHaveLength(cases.length);
  for(let i=0;i<cases.length;i++){
   const item=imported.items[i],nature=cases[i][1],mint=cases[i][2];
   expect((jaData as any).natures[item.iv.nature.name]).toBe(nature);
   expect(item.iv.nature.mint).toBe(mint);
   if(mint){
    expect(item.iv.nature.energyRecoveryFactor).toBe(1);
    expect(item.iv.nature.mainSkillChanceFactor).toBe(1);
    expect(item.iv.nature.ingredientFindingFactor).toBe(1);
    expect(item.iv.nature.speedOfHelpFactor).toBe(1);
   }
  }
  const exported=exportToCsvTsv(imported.items,t,"csv");
  const exportedHead=exported.split("\n")[0];
  expect(exportedHead.split(",")).toEqual(header);
  const again=importFromCsvTsv(exported,"csv",t);
  expect(again.warnings).toEqual([]);
  expect(again.items).toHaveLength(cases.length);
  for(let i=0;i<again.items.length;i++){
   expect(again.items[i].iv.nature.isEqual(imported.items[i].iv.nature)).toBe(true);
  }
 });
 test("legacy 16-column CSV still imports but cannot preserve mint flags",()=>{
  const p=master.pokemon.find(p=>p.name==="ピカチュウ")!;
  const oldHeader=header.filter(v=>v!=="まっしろミント"&&v!=="お気に入り");
  const oldRow=row(p,888).filter((_,i)=>i!==9&&i!==17);
  oldRow[8]="いじっぱり";
  expect(oldHeader).toHaveLength(16);expect(oldRow).toHaveLength(16);
  const result=importFromCsvTsv(serialize([oldHeader,oldRow]),"csv",t);
  expect(result.warnings).toEqual([]);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].iv.nature.mint).toBe(false);
  expect((jaData as any).natures[result.items[0].iv.nature.name]).toBe("いじっぱり");
 });
 test("neutral nature rejects mint flag semantically without rejecting the row",()=>{
  const p=master.pokemon.find(p=>p.name==="ピカチュウ")!;
  const r=row(p,777);r[8]="てれや";r[9]="1";
  const parsed=importFromCsvTsv(serialize([header,r]),"csv",t);
  expect(parsed.warnings).toEqual([]);
  expect(parsed.items).toHaveLength(1);
  expect(parsed.items[0].iv.nature.mint).toBe(false);
 });
 test("invalid mint values are never interpreted as true",()=>{
  const p=master.pokemon.find(p=>p.name==="ピカチュウ")!;
  const r=row(p,778);r[8]="いじっぱり";r[9]="bogus";
  const parsed=importFromCsvTsv(serialize([header,r]),"csv",t);
  expect(parsed.warnings).toEqual([]);
  expect(parsed.items[0].iv.nature.mint).toBe(false);
 });
});

describe("REAL production scan exporter -> latest upstream importer",()=>{
 const p=process.env.SCAN_EXPORTED_CSV_PATH;
 (p?test:test.skip)("production 18-column CSV imports without loss and round-trips",()=>{
  const csv=readFileSync(p!,"utf8");
  const imported=importFromCsvTsv(csv,"csv",t);
  expect(imported.warnings).toEqual([]);
  expect(imported.items).toHaveLength(6);
  const expected=[
   ["いじっぱり",true],["おだやか",false],["てれや",false],
   ["いじっぱり",true],["いじっぱり",true],["おだやか",true]
  ] as const;
  imported.items.forEach((item,i)=>{
   expect((jaData as any).natures[item.iv.nature.name]).toBe(expected[i][0]);
   expect(item.iv.nature.mint, 'mint mismatch for row '+i+' species '+item.iv.pokemonName+' nature '+item.iv.nature.name).toBe(expected[i][1]);
   if(expected[i][1])expect(item.iv.nature.speedOfHelpFactor).toBe(1);
  });
  expect(imported.items[0].nickname).toBe('ミント,「試験」');
  const exported=exportToCsvTsv(imported.items,t,"csv");
  const importedAgain=importFromCsvTsv(exported,"csv",t);
  expect(importedAgain.warnings).toEqual([]);
  expect(importedAgain.items).toHaveLength(6);
  for(let i=0;i<6;i++){
   expect(importedAgain.items[i].iv.nature.isEqual(imported.items[i].iv.nature)).toBe(true);
   expect(importedAgain.items[i].nickname).toBe(imported.items[i].nickname);
  }
 });
});
