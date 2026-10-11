"use strict";
/* Static headless unit-smoke only; NOT screenshot recognition or real-device E2E. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const runtime = { window: {} };
vm.createContext(runtime);
for (const file of ["master_data.js", "classifier.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), runtime, { filename: file });
}
const M = runtime.window.POKESLEEP_MASTER;
const C = runtime.window.POKESLEEP_CLASSIFIER;

test("preserved runtime exposes expected master and classifier", () => {
  assert.equal(M.pokemon.length, 249);
  assert.equal(M.natures.length, 25);
  assert.equal(M.subskills.length, 17);
  assert.equal(typeof C.inferWithoutFoods, "function");
  assert.equal(typeof C.resolveWithFoods, "function");
  assert.equal(typeof C.mainSkillMatches, "function");
});

test("classifier guards against incomplete inputs", () => {
  assert.equal(C.inferWithoutFoods({}).status, "MISSING_INPUT");
  assert.equal(C.mainSkillMatches("", M.pokemon[0].mainSkill), false);
});

test("a self-consistent ordinary species vector still survives full classification", () => {
  const species = M.pokemon.find(p => p.name === "フシギダネ");
  assert.ok(species);
  const profile = C.profiles(species)[0];
  assert.equal(profile.items.length, 3);
  const nature = M.natures.find(n => n.ja === "てれや");
  assert.ok(nature);
  const level = 10, ribbon = 0, skillLevel = 1, subskills = [];
  const mod = C.modFromObserved(subskills, level);
  const helpSeconds = Math.floor(C.frequency(species, level, nature, mod, ribbon) + 1e-9);
  const sp = C.computeSp(species, profile, level, nature, mod, ribbon, skillLevel);
  assert.ok(Number.isInteger(sp));
  const observations = {
    level, sp, helpSeconds, skillLevel, subskills,
    mainSkill: species.mainSkill,
    nature: nature.ja,
    carry: species.carryLimit,
    foods: profile.items.map(x => x.name)
  };
  const result = C.classify(observations);
  assert.ok(result.candidates.includes(species.name),
    "Existing classifier lost a self-consistent candidate: " + JSON.stringify(result));
  assert.ok(result.hits.some(h => h.pokemon === species.name && h.carryMatch === true));
});
