#!/usr/bin/env node
require('../recovery-content.js');
require('../recovery-state-schema.js');
require('../recovery-logic.js');
require('../recovery-session-core.js');
require('../recovery-session-client.js');

const logic = require('../recovery-logic.js');
const core = require('../recovery-session-core.js');
if (typeof logic.reviewErase !== 'function' || typeof core.createMemoryRedis !== 'function') {
  console.error('smoke:modules failed: recovery engine or session core did not load');
  process.exit(1);
}
console.log('smoke:modules passed');
