export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Error inesperado'); e.status = r.status; throw e; }
  return data;
}
