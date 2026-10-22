import test from "node:test";
import assert from "node:assert/strict";
import {
  canBranch,
  dependencyIds,
  dependentScenarioIds,
} from "../../src/domain/decision/dependencies";

test("changed paths invalidate descendants while independent paths remain untouched", () => {
  const scenarios = [
    { id: "root", pathId: "a", parentId: null },
    { id: "child", pathId: "a", parentId: "root" },
    { id: "other", pathId: "b", parentId: null },
  ];
  assert.deepEqual(dependentScenarioIds(scenarios, [], ["a"]).sort(), ["child", "root"]);
  assert.deepEqual(dependentScenarioIds(scenarios, ["root"], []).sort(), ["child", "root"]);
});
test("unknown dependency IDs fail, hard constraints cannot be omitted", () => {
  const known = [
    { id: "goal", kind: "goal" },
    { id: "money", kind: "budget" },
    { id: "family", kind: "family" },
  ];
  assert.throws(() => dependencyIds(known, ["foreign"]));
  assert.deepEqual(new Set(dependencyIds(known, ["goal"])), new Set(["goal", "money", "family"]));
  assert.equal(dependencyIds(known, []).length, 3);
});
test("branch limits protect depth and total count independently", () => {
  assert.equal(canBranch(1, 5), true);
  assert.equal(canBranch(2, 2), false);
  assert.equal(canBranch(0, 6), false);
});
