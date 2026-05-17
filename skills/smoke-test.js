#!/usr/bin/env node
'use strict';

const https = require('https');
const { URL } = require('url');

function buildMetrics() {
  return {
    series: [
      {
        metric: 'profiling.smoke_test',
        points: [[Math.floor(Date.now() / 1000), Math.floor(Math.random() * 1000)]],
        type: 'gauge',
        tags: ['smoke:true', 'source:local'],
      },
    ],
  };
}

async function send(metrics, apiKey, apiUrl = 'https://api.datadoghq.com') {
  if (!apiKey) {
    console.log('No DATADOG_API_KEY provided — printing payload instead of sending:');
    console.log(JSON.stringify(metrics, null, 2));
    return { success: false, reason: 'no-api-key' };
  }

  const url = new URL('/api/v1/series', apiUrl);
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
      res.on('data', (c) => (data += c));
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

(async function main() {
  const apiKey = process.env.DATADOG_API_KEY;
  const apiUrl = process.env.DATADOG_API_URL || process.env.DATADOG_URL || 'https://api.datadoghq.com';
  const metrics = buildMetrics();

  try {
    const result = await send(metrics, apiKey, apiUrl);
    console.log('Smoke test result:', result);
  } catch (err) {
    console.error('Smoke test failed:', err.message);
    process.exit(2);
  }
})();
