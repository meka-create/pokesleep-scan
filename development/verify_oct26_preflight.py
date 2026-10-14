#!/usr/bin/env python3
"""Future-release synthetic preflight; source clone and numbers are disposable test data."""
import copy,json,pathlib,sys
from master_auto_update import Hold,project
ROOT=pathlib.Path(__file__).resolve().parents[1]
NEW={"Misdreavus":"ムウマ","Mismagius":"ムウマージ"}
def main(upstream,out):
 prior=json.loads((ROOT/"shared/MASTER_DATA.json").read_text(encoding="utf-8"))
 assert len(prior["pokemon"])==249
 source=upstream/"src/data/pokemon.json"
 original=json.loads(source.read_text(encoding="utf-8"))
 by_name={p["name"]:p for p in original}
 assert set(NEW)<=set(by_name)
 assert all(by_name[n]["arrival"]=="2026-10-26" for n in NEW)
 assert all(by_name[n]["skill"]=="Cooking Advance S (Mystical Fire)" for n in NEW)
 try:
  actual,report=project(upstream,prior,commit="a"*40)
 except Hold as e:
  print("CURRENT ACTUAL UPSTREAM: HOLD:",e)
 else:
  print("CURRENT ACTUAL UPSTREAM: import accepted; added:",report["addedSpecies"])
  assert set(NEW)<=set(report["addedSpecies"])
 # Synthetic values — never actual or predicted game parameters.
 profiles={"Misdreavus":(3900,18,17.0,5.0),"Mismagius":(2700,28,19.0,5.4)}
 simulated=copy.deepcopy(original)
 for p in simulated:
  if p["name"] not in profiles:continue
  freq,carry,ing,skill=profiles[p["name"]]
  p.update(frequency=freq,carryLimit=carry,ingRate=ing,skillRate=skill,specialty="Skills")
  p["ing1"]={"name":"apple","c1":1,"c2":2,"c3":4}
  p["ing2"]={"name":"mushroom","c2":2,"c3":3}
  p["ing3"]={"name":"herb","c3":4}
 source.write_text(json.dumps(simulated,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 master,report=project(upstream,prior,commit="a"*40)
 assert len(master["pokemon"])==251,report
 assert set(report["addedSpecies"])==set(NEW),report
 known={p["name_en"]:p for p in prior["pokemon"]}
 observed={p["name_en"]:p for p in master["pokemon"]}
 assert all(observed.get(k)==v for k,v in known.items()),"existing 249 changed"
 for name,ja in NEW.items():
  assert observed[name]["name"]==ja
  assert observed[name]["mainSkill"]=="マジカルフレイム (料理アドバンスS)"
 _,again=project(upstream,master,commit="a"*40)
 assert not again["changed"],"second import was not idempotent"
 out.write_text(json.dumps(master,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("SYNTHETIC MASTER: PASS; 249 untouched + 2 added; skill translation; idempotence")
 print("WARNING: synthetic numbers are not official and do not prove Oct26 real screenshots")
if __name__=="__main__":
 if len(sys.argv)!=3:sys.exit("Usage: verify_oct26_preflight.py <disposable upstream repo> <output.json>")
 main(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))
