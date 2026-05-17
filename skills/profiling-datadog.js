/**
 * Profiling + Datadog Skill
 * Runs profiling workload,   captures metrics, and sends them to Datadog
 */

'use strict';

const { spawn } = require('child_process');
const https = require('https');
const { URL } = require('url');

async function sendToDatadog(metrics, apiKey, apiUrl = 'https://api.datadoghq.com') {
  if (!apiKey) throw new Error('Datadog API key required');

  const url = new URL('/api/v1/series', apiUrl);
  // Use query param for api key for best compatibility across Datadog sites
  url.searchParams.set('api_key', apiKey);

  const payload = JSON.stringify(metrics);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`Datadog API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  name: 'profiling-datadog',
  description: 'Run profiling workload and send metrics to Datadog',

  async execute() {
    const apiKey = process.env.DATADOG_API_KEY;
    if (!apiKey) {
      console.warn('[profiling-datadog] DATADOG_API_KEY not set, skipping Datadog send');
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // Run the profiling script directly so measurements relate to the profiled process
      const child = spawn('node', ['index.js'], {
        stdio: 'inherit',
        shell: false,
      });

      child.on('close', async (code) => {
        const duration = Date.now() - startTime;

        if (code !== 0) {
          return reject(new Error(`Profiling failed with exit code ${code}`));
        }

        console.log(`[profiling-datadog] Profiling completed in ${duration}ms`);

        const metrics = {
          series: [
            {
              metric: 'profiling.duration_ms',
              points: [[Math.floor(Date.now() / 1000), duration]],
              type: 'gauge',
              tags: ['workflow:profiling', 'source:github-actions'],
            },
          ],
        };

        if (apiKey) {
          try {
            const apiUrl = process.env.DATADOG_API_URL || process.env.DATADOG_URL || 'https://api.datadoghq.com';
            console.log('[profiling-datadog] Sending metrics to Datadog...');
            await sendToDatadog(metrics, apiKey, apiUrl);
            console.log('[profiling-datadog] Metrics sent successfully');
          } catch (err) {
            console.error(`[profiling-datadog] Failed to send metrics: ${err.message}`);
          }
        }

        resolve({
          success: true,
          duration,
          metrics,
        });
      });

      child.on('error', reject);
    });
  },
};
