#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');

const supportedSkills = new Map([
  ['profiling', { command: 'npm', args: ['run', 'prof'], description: 'Run Node.js profiling workload' }],
]);

function parseArgs() {
  const skillFlag = '--skill';
  const index = process.argv.indexOf(skillFlag);
  if (index === -1 || index === process.argv.length - 1) {
    console.error('Usage: node profiling-agent.js --skill profiling');
    console.error('Supported skills:');
    for (const [name, info] of supportedSkills) {
      console.error(`  - ${name}: ${info.description}`);
    }
    process.exit(1);
  }
  return process.argv[index + 1];
}

async function run() {
  const skill = parseArgs();
  const metadata = supportedSkills.get(skill);
  if (!metadata) {
    console.error(`Unsupported skill: ${skill}`);
    process.exit(1);
  }

  console.log(`Agent: executing '${skill}' skill...`);
  const child = spawn(metadata.command, metadata.args, { stdio: 'inherit', shell: false });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`Agent: '${skill}' skill failed with exit code ${code}`);
      process.exit(code);
    }
    console.log(`Agent: '${skill}' skill completed successfully.`);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
