// modules/state.js
export function createAppState(scenarios) {
  const firstScenarioId = scenarios[0]?.id || "";
  return {
    scenarios,
    activeScenarioId: firstScenarioId,
    activeTagByScenario: {}, // { [scenarioId]: tag }
  };
}

export function getScenario(state, id) {
  const s = state.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`Scenario not found: ${id}`);
  return s;
}

export function getActiveTag(state) {
  const scenario = getScenario(state, state.activeScenarioId);
  return state.activeTagByScenario[state.activeScenarioId] || scenario.tags?.[0] || "default";
}
