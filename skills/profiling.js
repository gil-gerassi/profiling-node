#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');

module.exports = {
  name: 'profiling',
  description: 'Run the profiling workload (node index.js)',

  async execute() {
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn('node', ['index.js'], { stdio: 'inherit', shell: false });

      child.on('close', (code) => {
        const duration = Date.now() - start;
        if (code !== 0) return reject(new Error(`Profiling exited with ${code}`));
        resolve({ success: true, duration });
      });

      child.on('error', (err) => reject(err));
    });
  },
};
