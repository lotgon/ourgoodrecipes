import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// With no filesystem, module loading or network capabilities in this sandbox,
// executing the old entry point must do nothing except explain the refusal.
const messages = [];
const process = { exitCode: 0 };
vm.runInNewContext(readFileSync(new URL('./import-blogger.mjs', import.meta.url), 'utf8'), {
  console: { error: message => messages.push(message) },
  process,
  fetch() { assert.fail('The retired importer must never access the network'); },
}, { timeout: 1000 });
assert.equal(process.exitCode, 1);
assert.equal(messages.length, 1);
assert.match(messages[0], /disabled/);
assert.match(messages[0], /python scripts\/import-takeout\.py/);

const workflow = readFileSync(new URL('../.github/workflows/import-blogger.yml', import.meta.url), 'utf8');
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /permissions: \{\}/);
assert.doesNotMatch(workflow, /^\s+(push|schedule|pull_request):/m);
assert.doesNotMatch(workflow, /actions\/checkout|git (push|commit)|contents: write/);
assert.match(workflow, /exit 1/);
console.log('Legacy import is disabled without network or filesystem side effects.');
