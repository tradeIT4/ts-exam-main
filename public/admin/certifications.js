const el = (id) => document.getElementById(id);
let page = 1;
let totalPages = 0;
let busy = false;
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${el('key').value}`, ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.message || 'Request failed');
  return body;
}
async function load() {
  const body = await api(`/api/v1/certifications?page=${page}&limit=25`);
  totalPages = body.totalPages;
  el('rows').replaceChildren();
  for (const item of body.data) {
    const row = document.createElement('tr');
    for (const text of [`${item.studentName} (${item.studentId})`, item.courseName, item.status === 'hold' ? 'On hold' : 'Access granted']) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    const controls = document.createElement('td');
    for (const [label, status, rotateCode] of [[item.status === 'hold' ? 'Grant access / Remove hold' : 'Place on hold', item.status === 'hold' ? 'active' : 'hold', false], ['Generate student code', item.status, true]]) {
      const button = document.createElement('button'); button.textContent = label; button.type = 'button';
      button.addEventListener('click', () => run(async () => {
        const result = await api(`/api/v1/certifications/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify({ status, rotateCode }) });
        el('code-message').textContent = result.accessCode ? `Private code for ${item.studentName} — ${item.courseName}: ${result.accessCode}. Save and share this code; it is displayed only once.` : '';
        await load();
        el('message').textContent = status === 'hold' ? 'Certification is on hold.' : 'Certification access granted.';
      })); controls.append(button, ' ');
    }
    row.append(controls); el('rows').append(row);
  }
  el('page').textContent = body.total ? `Page ${page} of ${totalPages} (${body.total} registrations)` : 'No students registered.';
  el('previous').disabled = page <= 1; el('next').disabled = page >= totalPages;
}
async function run(action) {
  if (busy) return; busy = true; el('message').textContent = 'Loading…';
  try { await action(); if (el('message').textContent === 'Loading…') el('message').textContent = ''; }
  catch (error) { el('message').textContent = error.message; el('rows').replaceChildren(); }
  finally { busy = false; }
}
el('login').addEventListener('submit', (event) => { event.preventDefault(); run(async () => { page = 1; el('code-message').textContent = ''; await load(); }); });
el('previous').addEventListener('click', () => run(async () => { page = Math.max(1, page - 1); await load(); }));
el('next').addEventListener('click', () => run(async () => { page = Math.min(totalPages, page + 1); await load(); }));
