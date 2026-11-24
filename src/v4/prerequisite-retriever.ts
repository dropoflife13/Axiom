// src/v4/prerequisite-retriever.ts
// Prerequisite-Aware Retrieval for Axiom-HOPE (Ablation v4).
// Prevents attentional checklist displacement (e.g., F-05 created_at / F-01 PK)
// while strictly preserving the Top-K prompt token budget.

export type PrerequisiteGraph = Readonly<Record<string, readonly string[]>>;

export interface PrerequisiteRetrievalResult {
  selected: string[];
  injectedPrerequisites: string[];
  displaced: string[];
}

/**
 * Default PostgreSQL v3 prerequisite dependency graph linking complex feature rules
 * to the foundational base-schema invariants they depend on.
 * Every prerequisite target is guaranteed applicable whenever its dependent rule is applicable.
 */
export const DEFAULT_POSTGRES_PREREQUISITE_GRAPH: PrerequisiteGraph = Object.freeze({
  // Append-only audit & lineage rules depend on base PK (F-01) and creation timestamp (F-05)
  'F-19': ['F-01', 'F-05'],
  'F-20': ['F-01', 'F-05'],
  'F-36': ['F-01', 'F-05'],
  // Ingestion triggers & idempotency constraints depend on base PK (F-01) and created_at (F-05)
  'F-32': ['F-01', 'F-05'],
  'F-37': ['F-01', 'F-05'],
  // Multi-tenant RLS policies depend on tenant_id (F-02), RLS enablement (F-25), and base table schema (F-01, F-05)
  'F-25': ['F-01', 'F-05'],
  'F-26': ['F-25'],
  // Mutable lifecycle triggers & soft-delete columns depend on base PK (F-01) and created_at (F-05)
  'F-10': ['F-01', 'F-05'],
  'F-21': ['F-01', 'F-05'],
  // Foreign key naming & indexing depend on PK identity (F-01)
  'F-16': ['F-01'],
  'F-22': ['F-01'],
});

/**
 * Cycle-safe DFS collecting all transitive prerequisites of `rootId` in topological
 * (deepest-prerequisite-first) deterministic order.
 */
export function collectTransitivePrerequisites(
  rootId: string,
  graph: PrerequisiteGraph
): string[] {
  const visited = new Set<string>([rootId]);
  const ordered: string[] = [];

  const dfs = (nodeId: string): void => {
    const direct = graph[nodeId] ?? [];
    for (const prereq of direct) {
      if (visited.has(prereq)) continue;
      visited.add(prereq);
      dfs(prereq);
      ordered.push(prereq);
    }
  };

  dfs(rootId);
  return ordered;
}

/**
 * Retrieves up to `budgetK` rules from `rankedFactIds` while automatically pulling in
 * any missing transitive prerequisites declared in `graph`.
 *
 * Budget enforcement:
 * - Never exceeds `budgetK` and never produces duplicates.
 * - Missing prerequisites evict the lowest-ranked non-prerequisite tail items first,
 *   keeping exact Top-K prompt token budget parity.
 * - Cycle-safe even if `graph` contains circular dependencies (e.g., A -> B -> A).
 */
export function retrieveWithPrerequisites(
  rankedFactIds: readonly string[],
  budgetK: number,
  graph: PrerequisiteGraph,
  applicableFactIds?: ReadonlySet<string>
): PrerequisiteRetrievalResult {
  if (budgetK <= 0) {
    return { selected: [], injectedPrerequisites: [], displaced: [] };
  }

  // Deduplicate ranked input while preserving rank order
  const uniqueRanked: string[] = [];
  const seenRanked = new Set<string>();
  for (const id of rankedFactIds) {
    if (!seenRanked.has(id)) {
      seenRanked.add(id);
      uniqueRanked.push(id);
    }
  }

  if (uniqueRanked.length === 0) {
    return { selected: [], injectedPrerequisites: [], displaced: [] };
  }

  const selected = uniqueRanked.slice(0, budgetK);
  const initialSelectedSet = new Set(selected);
  const injectedSet = new Set<string>();
  const injectedOrder: string[] = [];
  const displaced: string[] = [];

  // Fixed-point loop: inspect highest-ranked selected rules first, pull in missing
  // transitive prerequisites, evicting the lowest-ranked non-prerequisite tail slot.
  let changed = true;
  let guard = 0;
  const maxIterations = Math.max(budgetK * 4, 32);

  while (changed && guard < maxIterations) {
    changed = false;
    guard++;

    // Build set of all prerequisites required by currently selected rules
    const protectedPrereqs = new Set<string>(injectedSet);
    const missingQueue: string[] = [];
    const queuedSet = new Set<string>();

    for (const ruleId of selected) {
      const prereqs = collectTransitivePrerequisites(ruleId, graph);
      for (const p of prereqs) {
        if (applicableFactIds && !applicableFactIds.has(p)) continue;
        protectedPrereqs.add(p);
        if (!selected.includes(p) && !queuedSet.has(p)) {
          queuedSet.add(p);
          missingQueue.push(p);
        }
      }
    }

    for (const prereq of missingQueue) {
      if (selected.includes(prereq)) continue;

      if (selected.length < budgetK) {
        selected.push(prereq);
        injectedSet.add(prereq);
        injectedOrder.push(prereq);
        changed = true;
        continue;
      }

      // Find lowest-ranked evictable item (from tail to head) that is NOT protected
      let evictIdx = -1;
      for (let i = selected.length - 1; i >= 0; i--) {
        const candidate = selected[i];
        if (!protectedPrereqs.has(candidate)) {
          evictIdx = i;
          break;
        }
      }

      if (evictIdx === -1) {
        // Budget completely saturated by protected prerequisites; stop safely without exceeding K
        break;
      }

      const [evicted] = selected.splice(evictIdx, 1);
      if (initialSelectedSet.has(evicted)) {
        displaced.push(evicted);
      }
      selected.push(prereq);
      injectedSet.add(prereq);
      injectedOrder.push(prereq);
      protectedPrereqs.add(prereq);
      changed = true;
      // Recompute protected set on next outer iteration so evicted rule's orphaned prereqs aren't frozen
      break;
    }
  }

  // Deterministic ordering: foundational injected prerequisites first (in discovery order),
  // followed by surviving originally ranked rules in their exact rank order.
  const survivingRanked = selected.filter((id) => !injectedSet.has(id));
  const finalSelected = [...injectedOrder, ...survivingRanked].slice(0, budgetK);

  return {
    selected: finalSelected,
    injectedPrerequisites: injectedOrder,
    displaced,
  };
}
