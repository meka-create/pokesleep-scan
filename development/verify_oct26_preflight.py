#!/usr/bin/env python3
"""Future-release synthetic preflight; source clone and numbers are disposable test data."""
import copy,datetime,hashlib,json,pathlib,shutil,sys,tempfile
from master_auto_update import Hold,project,promote
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
 # The real upstream currently carries placeholders. The deterministic date
 # checks are separate from the actual CI execution calendar.
 before,pre_report=project(upstream,prior,commit="a"*40,
                            today_jst=datetime.date(2026,10,25))
 assert len(before["pokemon"])==249
 assert {p["name"] for p in pre_report["deferredSpecies"]}==set(NEW)
 print("AS-IS UPSTREAM BEFORE ARRIVAL: PASS — new species deferred, baseline preserved")
 at_release,release_report=project(upstream,prior,commit="a"*40,
                           today_jst=datetime.date(2026,10,26))
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
  p["ing1"]={"name":"apple","c1":1,"c2":2,"c3":4}
  p["ing2"]={"name":"mushroom","c2":2,"c3":3}
  p["ing3"]={"name":"herb","c3":4}
 source.write_text(json.dumps(simulated,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 # Complete synthetic values may NOT be imported early.
 before_synthetic,early=project(upstream,prior,commit="a"*40,
                   today_jst=datetime.date(2026,10,25))
 assert len(before_synthetic["pokemon"])==249 and not early["addedSpecies"]
 master,report=project(upstream,prior,commit="a"*40,
                       today_jst=datetime.date(2026,10,26))
 assert len(master["pokemon"])==251,report
 assert set(report["addedSpecies"])==set(NEW),report
 known={p["name_en"]:p for p in prior["pokemon"]}
 observed={p["name_en"]:p for p in master["pokemon"]}
 assert all(observed.get(k)==v for k,v in known.items()),"existing 249 changed"
 for name,ja in NEW.items():
  assert observed[name]["name"]==ja
  assert observed[name]["mainSkill"]=="マジカルフレイム (料理アドバンスS)"
 _,again=project(upstream,master,commit="a"*40,today_jst=datetime.date(2026,10,27))
 assert not again["changed"],"second import was not idempotent"
 # End-to-end release promotion on a scratch copy, including app/sw/release tokens.
 with tempfile.TemporaryDirectory(prefix="oct26-release-") as folder:
  scratch=pathlib.Path(folder)
  (scratch/"shared").mkdir(parents=True)
  (scratch/"shared/MASTER_DATA.json").write_text(json.dumps(prior,ensure_ascii=False),encoding="utf-8")
  for file in ("app.js","sw.js","release.json","food_color_features.js"):
   shutil.copy2(ROOT/file,scratch/file)
  assert promote(scratch,master,report),"release promotion failed"
  bytes_=(scratch/"shared/MASTER_DATA.json").read_bytes()
  receipt=json.loads((scratch/"shared/master_release.json").read_text(encoding="utf-8"))
  release=json.loads((scratch/"release.json").read_text(encoding="utf-8"))["id"]
  assert receipt["speciesCount"]==251
  assert receipt["sha256"]==hashlib.sha256(bytes_).hexdigest()
  assert release in (scratch/"app.js").read_text(encoding="utf-8")
  assert release in (scratch/"sw.js").read_text(encoding="utf-8")
  assert len(json.loads(bytes_)["pokemon"])==251
  print("SYNTHETIC PROMOTION: PASS — 251 master SHA-256, release.json, app.js, sw.js")
 out.write_text(json.dumps(master,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("SYNTHETIC MASTER: PASS; 249 untouched + 2 added; skill translation; idempotence")
 print("WARNING: synthetic numbers are not official and do not prove Oct26 real screenshots")
if __name__=="__main__":
 if len(sys.argv)!=3:sys.exit("Usage: verify_oct26_preflight.py <disposable upstream repo> <output.json>")
 main(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))
