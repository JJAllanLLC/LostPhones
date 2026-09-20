#!/usr/bin/env node
require('../recovery-content.js');
require('../recovery-state-schema.js');
require('../recovery-logic.js');
require('../recovery-session-core.js');
require('../recovery-session-client.js');
require('../analytics-events.js');
require('../preparedness-state-schema.js');
require('../preparedness-content.js');
require('../preparedness-recommendations.js');
require('../preparedness-logic.js');
require('../recovery-plan-core.js');
require('../recovery-plan-pdf.js');

const logic = require('../recovery-logic.js');
const core = require('../recovery-session-core.js');
const plan = require('../recovery-plan-core.js');
const preparedness = require('../preparedness-logic.js');
if (
  typeof logic.reviewErase !== 'function'
  || typeof core.createMemoryRedis !== 'function'
  || typeof plan.isPaidOfferEligible !== 'function'
  || typeof preparedness.recommendationIdsFor !== 'function'
) {
  console.error('smoke:modules failed: recovery, preparedness, or plan modules did not load');
  process.exit(1);
}
console.log('smoke:modules passed');
