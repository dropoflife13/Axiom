// src/harvest-cli.ts
import { harvestCanaryOutputs } from './promote.js';

const res = harvestCanaryOutputs();
console.log(`\n================ CANARY CANDIDATE HARVEST ================`);
console.log(`Harvested: ${res.harvested} new candidates | Skipped/Existing: ${res.skipped}`);
console.log(`Total Staged Candidates: ${res.candidates.length}\n`);

console.table(
  res.candidates.map((c) => ({
    id: c.id,
    source: c.sourceAgent,
    conf: c.enforcedConf,
    llmConf: c.llmConfidence,
    status: c.status,
    sha256: c.sha256,
  }))
);
