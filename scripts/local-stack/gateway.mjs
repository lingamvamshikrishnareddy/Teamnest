#!/usr/bin/env node
// Tiny stand-in for Supabase's Kong gateway (local dev / CI only):
//   /rest/v1/*  → PostgREST   (PGRST_PORT, default 3001)
//   /auth/v1/*  → Supabase Auth (AUTH_PORT, default 9999)
// Adds permissive CORS so the web app and Expo web can call it from the browser.
import http from 'node:http';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const routes = [
  { prefix: '/rest/v1', port: Number(process.env.PGRST_PORT ?? 3001) },
  { prefix: '/auth/v1', port: Number(process.env.AUTH_PORT ?? 9999) },
];

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,apikey,content-type,prefer,range,x-client-info,x-teamnest-client,accept-profile,content-profile,x-supabase-api-version',
  'access-control-expose-headers': 'content-range,x-total-count',
  'access-control-max-age': '86400',
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const route = routes.find((r) => req.url?.startsWith(r.prefix));
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json', ...cors });
      return res.end(JSON.stringify({ message: 'no route' }));
    }
    const headers = { ...req.headers, host: `127.0.0.1:${route.port}` };
    const upstream = http.request(
      { host: '127.0.0.1', port: route.port, method: req.method, path: req.url.slice(route.prefix.length) || '/', headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify({ message: `upstream error: ${e.message}` }));
    });
    req.pipe(upstream);
  })
  .listen(PORT, '0.0.0.0', () => console.log(`gateway listening on :${PORT}`));
