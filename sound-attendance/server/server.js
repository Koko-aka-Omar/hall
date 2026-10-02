const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { Attendance } = require('./attendance');

function createApp({ attendance = new Attendance(), lecturerKey = randomBytes(24).toString('hex'), demoMode = false } = {}) {
  const root = path.resolve(__dirname, '../public');
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  function authorized(req) {
    const a = Buffer.from(req.headers.authorization || '');
    const b = Buffer.from('Bearer ' + lecturerKey);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
  const handler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'microphone=(self)');
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (route.startsWith('/api/')) {
        if ((route.startsWith('/api/lecturer/') || route === '/api/developer/token') && !authorized(req)) return json(res, 401, { error: 'Enter the lecturer access key shown in the server terminal.' });
        if (req.method === 'GET' && route === '/api/public') return json(res, 200, { ...attendance.view(), demoMode });
        if (req.method === 'GET' && route === '/api/lecturer/state') return json(res, 200, { ...attendance.view(true), demoMode });
        if (req.method !== 'POST') return json(res, 404, { error: 'Not found.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required.' });
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return json(res, 413, { error: 'Request too large.' }); }
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'Invalid JSON.' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Invalid request.' });
        let result;
        switch (route) {
          case '/api/lecturer/start': result = attendance.start(body.courseId); break;
          case '/api/lecturer/rotate': result = attendance.rotate(); break;
          case '/api/lecturer/stop': result = attendance.stop(); break;
          case '/api/lecturer/manual': result = attendance.checkIn(body, 'manual'); break;
          case '/api/check-in': result = attendance.checkIn(body); break;
          case '/api/developer/token':
            if (!demoMode) return json(res, 404, { error: 'Developer test mode is disabled. Start with DEMO_MODE=1.' });
            result = { token: attendance.requireActive().token }; break;
          default: return json(res, 404, { error: 'Not found.' });
        }
        return json(res, 200, result);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      const requested = route === '/' ? '/lecturer.html' : decodeURIComponent(route);
      const file = path.resolve(root, '.' + requested);
      if (!file.startsWith(root + path.sep) || !mime[path.extname(file)]) { res.writeHead(404); return res.end('Not found'); }
      let data;
      try { data = await fs.promises.readFile(file); } catch { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Server error. Please try again.' }); }
  };
  return { handler, lecturerKey, attendance };
}
if (require.main === module) {
  const app = createApp({ lecturerKey: process.env.LECTURER_KEY || undefined, demoMode: process.env.DEMO_MODE === '1' });
  const tls = process.env.TLS_CERT && process.env.TLS_KEY;
  const server = tls ? https.createServer({ cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) }, app.handler) : http.createServer(app.handler);
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`Sound Attendance: ${tls ? 'https' : 'http'}://localhost:${port}`);
    console.log(`Lecturer access key: ${app.lecturerKey}`);
    console.log(`Developer test mode: ${process.env.DEMO_MODE === '1' ? 'ON' : 'OFF'}; data is in memory and resets on restart.`);
  });
}
module.exports = { createApp };
