#!/usr/bin/env node
'use strict';

const path = require('path');

function parseArgs() {
  const skillFlag = '--skill';
  const index = process.argv.indexOf(skillFlag);
  if (index === -1 || index === process.argv.length - 1) {
    console.error('Usage: node profiling-agent.js --skill <skillName>');
    process.exit(1);
  }
  return process.argv[index + 1];
}

async function run() {
  const skillName = parseArgs();

  let skillModule;
  try {
    skillModule = require(path.join(__dirname, `${skillName}.js`));
  } catch (err) {
    console.error(`Error: skill '${skillName}' not found in skills/`);
    process.exit(1);
  }

  if (!skillModule || typeof skillModule.execute !== 'function') {
    console.error(`Error: skill '${skillName}' does not export an async execute() function`);
    process.exit(1);
  }

  try {
    console.log(`[Agent] Executing skill: ${skillName}`);
    const result = await skillModule.execute();
    console.log(`[Agent] Skill '${skillName}' completed.`, result || 'no result');
  } catch (err) {
    console.error(`[Agent] Skill '${skillName}' failed: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
