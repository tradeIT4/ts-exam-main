const el = (id) => document.getElementById(id);
let currentCode = '';
let generation = 0;
let checking = false;
function hideCertification() {
  el('certification').hidden = true;
  el('course').textContent = '';
}
async function request(path, accessCode) {
  const response = await fetch(path, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessCode }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Unable to check certification');
  return body;
}
async function checkStatus() {
  if (!currentCode || checking) return;
  checking = true;
  const version = generation;
  const code = currentCode;
  hideCertification();
  try {
    const body = await request('/api/v1/student/certifications/status', code);
    if (version !== generation) return;
    el('status').textContent = body.accessAllowed ? 'Access granted' : 'On hold';
    if (!body.accessAllowed) {
      el('message').textContent = 'Your certification is on hold and hidden. Access is blocked until your administrator removes the hold.';
      return;
    }
    const details = await request('/api/v1/student/certifications/view', code);
    if (version !== generation) return;
    el('course').textContent = details.courseName;
    el('certification').hidden = false;
    el('message').textContent = 'Your administrator has removed the hold. Contact them to receive your certificate.';
  } catch (error) {
    if (version !== generation) return;
    hideCertification(); el('status').textContent = ''; el('message').textContent = error.message;
  } finally { checking = false; }
}
el('status-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (checking) return;
  generation++; currentCode = el('access-code').value.trim();
  el('status').textContent = ''; el('message').textContent = 'Checking…';
  const button = event.target.querySelector('button'); button.disabled = true;
  try { await checkStatus(); } finally { button.disabled = false; }
});
el('access-code').addEventListener('input', () => {
  generation++; currentCode = ''; hideCertification(); el('status').textContent = ''; el('message').textContent = '';
});
// Keep an open student page aligned with changes made by the administrator.
setInterval(() => { if (!document.hidden) checkStatus(); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hideCertification(); else checkStatus();
});
