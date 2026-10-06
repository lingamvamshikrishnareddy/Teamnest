#!/usr/bin/env node
// Prints HS256 API keys (anon / service_role) for a given JWT secret.
//   node jwt.mjs <secret> anon|service_role
import { createHmac } from 'node:crypto';

const [secret, role] = process.argv.slice(2);
if (!secret || !role) {
  console.error('usage: node jwt.mjs <secret> <role>');
  process.exit(1);
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({ iss: 'supabase-local', role, iat: 1700000000, exp: 2100000000 });
const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
console.log(`${header}.${payload}.${sig}`);
