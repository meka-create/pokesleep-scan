#!/usr/bin/env python3
"""Future-release synthetic preflight; source clone and numbers are disposable test data."""
import copy,datetime,hashlib,json,pathlib,shutil,sys,tempfile
from master_auto_update import Hold,project,promote
ROOT=pathlib.Path(__file__).resolve().parents[1]
NEW={"Misdreavus":"ムウマ","Mismagius":"ムウマージ"}
def main(upstream,out):
 prior=json.loads((ROOT/"shared/MASTER_DATA.json").read_text(encoding="utf-8"))
 assert len(prior["pokemon"])>=249
 # Derive a historical pre-arrival baseline even after the actual master has
 # already absorbed the two species. Never overwrite the installed master.
 historical=copy.deepcopy(prior)
 historical["pokemon"]=[p for p in prior["pokemon"] if p["name_en"] not in NEW]
 assert 0<=len(prior["pokemon"])-len(historical["pokemon"])<=2
 source=upstream/"src/data/pokemon.json"
 original=json.loads(source.read_text(encoding="utf-8"))
 by_name={p["name"]:p for p in original}
 assert set(NEW)<=set(by_name)
 arrivals={name:datetime.date.fromisoformat(by_name[name]["arrival"]) for name in NEW}
 before_day=min(arrivals.values())-datetime.timedelta(days=1)
 due_day=max(arrivals.values())
 print("SOURCE ARRIVAL DATES:",{k:v.isoformat() for k,v in arrivals.items()})
 # The real upstream currently carries placeholders. The deterministic date
 # checks are separate from the actual CI execution calendar.
 before,pre_report=project(upstream,historical,commit="a"*40,
                            today_jst=before_day)
 assert len(before["pokemon"])==len(historical["pokemon"])
 assert set(NEW).issubset({p["name"] for p in pre_report["deferredSpecies"]})
 print("AS-IS UPSTREAM BEFORE ARRIVAL: PASS — new species deferred, baseline preserved")
 at_release,release_report=project(upstream,historical,commit="a"*40,
                           today_jst=due_day)
 if release_report["deferredSpecies"]:
  print("AS-IS UPSTREAM AT ARRIVAL: provisional species remain deferred:",
        [x["name"] for x in release_report["deferredSpecies"]])
 else:
  print("AS-IS UPSTREAM AT ARRIVAL: ready species accepted:",
        release_report["addedSpecies"])
 # Synthetic values — never actual or predicted game parameters.
 profiles={"Misdreavus":(3900,18,17.0,5.0),"Mismagius":(2700,28,19.0,5.4)}
 simulated=copy.deepcopy(original)
 for p in simulated:
  if p["name"] not in profiles:continue
  freq,carry,ing,skill=profiles[p["name"]]
  p.update(frequency=freq,carryLimit=carry,ingRate=ing,skillRate=skill,specialty="Skills")
  # The real unreleased skill is allowed to be unknown upstream. Populate
  # the synthetic test fixture only; never invent skill in production data.
  if p.get("skill") in (None,"unknown"):
   p["skill"]="Cooking Advance S (Mystical Fire)"
  p["ing1"]={"name":"apple","c1":1,"c2":2,"c3":4}
  p["ing2"]={"name":"mushroom","c2":2,"c3":3}
  p["ing3"]={"name":"herb","c3":4}
 source.write_text(json.dumps(simulated,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 # Complete synthetic values may NOT be imported early.
 before_synthetic,early=project(upstream,historical,commit="a"*40,
                   today_jst=before_day)
 assert len(before_synthetic["pokemon"])==len(historical["pokemon"]) and not early["addedSpecies"]
 master,report=project(upstream,historical,commit="a"*40,
                       today_jst=due_day)
 assert len(master["pokemon"])==len(historical["pokemon"])+2,report
 assert set(report["addedSpecies"])==set(NEW),report
 known={p["name_en"]:p for p in before_synthetic["pokemon"]}
 observed={p["name_en"]:p for p in master["pokemon"]}
 assert all(observed.get(k)==v for k,v in known.items()),"existing 249 changed"
 for name,ja in NEW.items():
  assert observed[name]["name"]==ja
  assert isinstance(observed[name]["mainSkill"],str) and observed[name]["mainSkill"].strip()
 _,again=project(upstream,master,commit="a"*40,today_jst=due_day+datetime.timedelta(days=1))
 assert not again["changed"],"second import was not idempotent"
 # End-to-end release promotion on a scratch copy, including app/sw/release tokens.
 with tempfile.TemporaryDirectory(prefix="oct26-release-") as folder:
  scratch=pathlib.Path(folder)
  (scratch/"shared").mkdir(parents=True)
  (scratch/"shared/MASTER_DATA.json").write_text(json.dumps(historical,ensure_ascii=False),encoding="utf-8")
  for file in ("app.js","sw.js","release.json","food_color_features.js"):
   shutil.copy2(ROOT/file,scratch/file)
  assert promote(scratch,master,report),"release promotion failed"
  bytes_=(scratch/"shared/MASTER_DATA.json").read_bytes()
  receipt=json.loads((scratch/"shared/master_release.json").read_text(encoding="utf-8"))
  release=json.loads((scratch/"release.json").read_text(encoding="utf-8"))["id"]
  assert receipt["speciesCount"]==len(historical["pokemon"])+2
  assert receipt["sha256"]==hashlib.sha256(bytes_).hexdigest()
  assert release in (scratch/"app.js").read_text(encoding="utf-8")
  assert release in (scratch/"sw.js").read_text(encoding="utf-8")
  assert len(json.loads(bytes_)["pokemon"])==len(historical["pokemon"])+2
  print("SYNTHETIC PROMOTION: PASS — variable master SHA-256, release.json, app.js, sw.js")
 out.write_text(json.dumps(master,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("SYNTHETIC MASTER: PASS; historical baseline preserved + 2 added; skill translation; idempotence")
 print("WARNING: synthetic numbers are not official and do not prove Oct26 real screenshots")
if __name__=="__main__":
 if len(sys.argv)!=3:sys.exit("Usage: verify_oct26_preflight.py <disposable upstream repo> <output.json>")
 main(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))
