const http = require('http');
const https = require('https');

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function startKeepAlive(port) {
  const url = process.env.RENDER_EXTERNAL_URL
    || process.env.KEEPALIVE_URL
    || `http://localhost:${port}`;

  const pingUrl = `${url}/api/health`;
  const isHttps = pingUrl.startsWith('https');
  const lib = isHttps ? https : http;

  console.log(`[keep-alive] Will ping ${pingUrl} every ${INTERVAL_MS / 1000 / 60} min`);

  function ping() {
    const req = lib.get(pingUrl, (res) => {
      if (res.statusCode === 200) {
        console.log(`[keep-alive] OK (${new Date().toISOString()})`);
      } else {
        console.log(`[keep-alive] Unexpected status: ${res.statusCode}`);
      }
      res.resume();
    });
    req.on('error', (err) => {
      console.log(`[keep-alive] Ping failed: ${err.message}`);
    });
    req.setTimeout(10000, () => {
      req.destroy();
      console.log(`[keep-alive] Timed out (${new Date().toISOString()})`);
    });
  }

  const immediate = setTimeout(() => {
    ping();
    setInterval(ping, INTERVAL_MS);
  }, 5000);
}

module.exports = { startKeepAlive };
