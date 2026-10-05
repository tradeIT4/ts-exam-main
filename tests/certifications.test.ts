import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { ClientService } from '../src/services/client-service.js';

test('certifications default to hold, require write permission, and expose private current status', async () => {
  const db = createDatabase(':memory:');
  db.prepare('INSERT INTO courses VALUES (?, ?, ?, ?, ?)').run('c', 'Course', 'type', 'CODE', new Date().toISOString());
  db.prepare('INSERT INTO registrations VALUES (?, ?, ?, ?, ?, ?, ?)').run('r', 's', 'Student', 's@example.com', null, 'c', new Date().toISOString());
  const clients = new ClientService(db);
  const admin = clients.createClient({ name: 'Admin', permissions: ['read:all', 'write:all'] }).apiKey;
  const reader = clients.createClient({ name: 'Reader', permissions: ['read:all'] }).apiKey;
  const server = createServer(createApp(db));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const base = `http://127.0.0.1:${address.port}`;
  const update = (key: string, status: string, rotateCode = false) => fetch(`${base}/api/v1/certifications/r`, { method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, rotateCode }) });
  const lookup = (accessCode: string) => fetch(`${base}/api/v1/student/certifications/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessCode }) });
  const view = (accessCode: string) => fetch(`${base}/api/v1/student/certifications/view`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessCode }) });
  try {
    assert.equal((await fetch(`${base}/api/v1/certifications`)).status, 401);
    const list = await fetch(`${base}/api/v1/certifications`, { headers: { Authorization: `Bearer ${admin}` } });
    assert.equal((await list.json() as { data: { status: string }[] }).data[0]?.status, 'hold');
    assert.equal((await update(reader, 'active')).status, 403);
    assert.equal((await update(admin, 'invalid')).status, 400);
    const hold = await update(admin, 'hold', true);
    const code = (await hold.json() as { accessCode: string }).accessCode;
    const held = await lookup(code);
    assert.equal(held.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await held.json(), { status: 'hold', accessAllowed: false });
    assert.equal((await view(code)).status, 403);
    assert.equal((await update(admin, 'active')).status, 200);
    assert.equal((await (await lookup(code)).json() as { status: string }).status, 'active');
    assert.deepEqual(await (await view(code)).json(), { courseName: 'Course', status: 'active' });
    await update(admin, 'hold');
    assert.equal((await (await lookup(code)).json() as { status: string }).status, 'hold');
    assert.equal((await view(code)).status, 403);
    const rotated = await update(admin, 'hold', true);
    const newCode = (await rotated.json() as { accessCode: string }).accessCode;
    assert.notEqual(newCode, code);
    assert.equal((await lookup(code)).status, 404);
    assert.equal((await lookup(newCode)).status, 200);
    assert.notEqual((db.prepare('SELECT access_code_hash FROM certifications').get())?.access_code_hash, newCode);
    assert.equal((await fetch(`${base}/student/certifications`)).status, 200);
    assert.equal((await fetch(`${base}/admin/certifications`)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  }
});
