/**
 * Heavy I/O profiling demo
 * Simulates disk writes, disk reads, and HTTP traffic concurrently.
 *
 * Usage:
 *   node index.js            # plain run 
 *   node --prof index.js     # V8 CPU profile (creates isolate-*.log)
 *   node --inspect index.js  # Chrome DevTools profiling
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline, Readable } = require('stream'); 

// ── Config ─────────────────────────────────────0000───────────────────────────────
const DISK_DIR        = path.join(__dirname, 'tmp');
const FILE_COUNT      = 20;          // files written concurrently per wave
const FILE_SIZE_MB    = 100;         // size of each file (increased to 100 MB)
const WAVES           = 5;           // how many write waves to run
const SERVER_PORT     = 3001;
const HTTP_WORKERS    = 10;          // concurrent HTTP clients
const HTTP_REQUESTS   = 200;         // total requests per worker
const CHUNK_SIZE      = 64 * 1024;   // 64 KB chunks for streaming writes

const BYTES_PER_FILE  = FILE_SIZE_MB * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomBuffer(size) {
  return crypto.randomBytes(size);   // intentionally non-trivial to generate
}

function log(label, msg) {
  process.stdout.write(`[${new Date().toISOString()}] [${label}] ${msg}\n`);
}

// ── Disk workload ─────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write a single large file by streaming random chunks.
 * Returns a Promise that resolves with bytes written.
 */
function writeFile(filePath) {
  return new Promise((resolve, reject) => {
    let written = 0;

    function* chunkGenerator() {
      while (written < BYTES_PER_FILE) {
        const remaining = BYTES_PER_FILE - written;
        const size = Math.min(CHUNK_SIZE, remaining);
        written += size;
        yield randomBuffer(size);
      }
    }

    const source = Readable.from(chunkGenerator());
    const dest   = fs.createWriteStream(filePath);

    pipeline(source, dest, (err) => {
      if (err) return reject(err);
      resolve(written);
    });
  });
}

/**
 * Read a file back sequentially (adds read pressure alongside writes).
 */
function readFile(filePath) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const rs = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
    rs.on('data', (chunk) => { bytes += chunk.length; });
    rs.on('end',  () => resolve(bytes));
    rs.on('error', reject);
  });
}

async function diskWave(wave) {
  log('DISK', `Wave ${wave}: writing ${FILE_COUNT} × ${FILE_SIZE_MB} MB files`);
  const files = Array.from({ length: FILE_COUNT }, (_, i) =>
    path.join(DISK_DIR, `wave${wave}-file${i}.bin`)
  );

  const start = Date.now();
  await Promise.all(files.map(writeFile));
  const writeMs = Date.now() - start;

  log('DISK', `Wave ${wave}: writes done in ${writeMs} ms — now reading back`);
  const readStart = Date.now();
  const totalRead = (await Promise.all(files.map(readFile))).reduce((a, b) => a + b, 0);
  log('DISK', `Wave ${wave}: read ${(totalRead / 1e6).toFixed(1)} MB in ${Date.now() - readStart} ms`);

  // Clean up to avoid filling the disk
  await Promise.all(files.map((f) => fs.promises.unlink(f).catch(() => {})));
}

async function runDiskWorkload() {
  ensureDir(DISK_DIR);
  for (let w = 1; w <= WAVES; w++) {
    await diskWave(w);
  }
  log('DISK', 'All waves complete');
}

// ── HTTP server ───────────────────────────────────────────────────────────────

/**
 * A simple HTTP server with several routes that exercise different patterns:
 *   GET /small  → tiny JSON response
 *   GET /large  → streams a large response body
 *   POST /echo  → reads full request body and echoes it back
 */
function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/small') {
      const body = JSON.stringify({ ok: true, ts: Date.now(), rand: Math.random() });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);

    } else if (req.method === 'GET' && req.url === '/large') {
      const size = 512 * 1024; // 512 KB payload
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size });
      let sent = 0;
      function sendChunk() {
        if (sent >= size) { res.end(); return; }
        const chunk = randomBuffer(Math.min(CHUNK_SIZE, size - sent));
        sent += chunk.length;
        if (!res.write(chunk)) {
          res.once('drain', sendChunk);
        } else {
          setImmediate(sendChunk);
        }
      }
      sendChunk();

    } else if (req.method === 'POST' && req.url === '/echo') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
        res.end(body);
      });

    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(SERVER_PORT, () => {
      log('HTTP', `Server listening on port ${SERVER_PORT}`);
      resolve(server);
    });
  });
}

// ── HTTP client workload ──────────────────────────────────────────────────────

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: 'localhost', port: SERVER_PORT, path }, (res) => {
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; });
      res.on('end', () => resolve(bytes));
    });
    req.on('error', reject);
  });
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname : 'localhost',
      port     : SERVER_PORT,
      path,
      method   : 'POST',
      headers  : { 'Content-Length': body.length, 'Content-Type': 'application/octet-stream' },
    };
    const req = http.request(opts, (res) => {
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; });
      res.on('end', () => resolve(bytes));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function runWorker(workerId) {
  const routes = ['/small', '/large', '/echo'];
  let totalBytes = 0;

  for (let i = 0; i < HTTP_REQUESTS; i++) {
    const route = routes[i % routes.length];
    if (route === '/echo') {
      const payload = randomBuffer(64 * 1024); // 64 KB POST body
      totalBytes += await httpPost(route, payload);
    } else {
      totalBytes += await httpGet(route);
    }
  }

  log('HTTP', `Worker ${workerId}: ${HTTP_REQUESTS} requests done, ${(totalBytes / 1e6).toFixed(1)} MB transferred`);
}

async function runNetworkWorkload() {
  log('HTTP', `Launching ${HTTP_WORKERS} concurrent workers × ${HTTP_REQUESTS} requests each`);
  const start = Date.now();
  await Promise.all(Array.from({ length: HTTP_WORKERS }, (_, i) => runWorker(i)));
  log('HTTP', `All workers done in ${Date.now() - start} ms`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  log('MAIN', 'Starting profiling demo');

  const server = await startServer();

  // Run disk and network workloads in parallel for maximum I/O overlap
  await Promise.all([
    runDiskWorkload(),
    runNetworkWorkload(),
  ]);

  log('MAIN', 'All workloads finished — shutting down');
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
