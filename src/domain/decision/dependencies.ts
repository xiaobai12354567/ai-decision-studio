/** Conditions use stable IDs; a missing dependency is handled conservatively. */
export function dependentScenarioIds(
  scenarios: { id: string; parentId: string | null; pathId: string }[],
  directIds: Iterable<string>,
  affectedPathIds: Iterable<string>,
) {
  const result = new Set(directIds);
  const paths = new Set(affectedPathIds);
  for (const item of scenarios) if (paths.has(item.pathId)) result.add(item.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of scenarios)
      if (item.parentId && result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id);
        changed = true;
      }
  }
  return [...result];
}

export function dependencyIds(known: { id: string; kind: string }[], proposed: string[]) {
  const valid = new Set(known.map((item) => item.id));
  if (proposed.some((id) => !valid.has(id))) throw new Error("模型引用了不存在的条件");
  // Always include budget/family constraints; absent references conservatively depend on every condition.
  return [
    ...new Set(
      proposed.length
        ? [
            ...proposed,
            ...known
              .filter((item) => ["budget", "family"].includes(item.kind))
              .map((item) => item.id),
          ]
        : [...valid],
    ),
  ];
}

export function canBranch(depth: number, scenarioCount: number) {
  return depth < 2 && scenarioCount < 6;
}
