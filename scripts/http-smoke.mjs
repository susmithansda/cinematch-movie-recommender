import assert from 'node:assert/strict';

const origin = process.env.FRAME_TEST_ORIGIN || 'http://127.0.0.1:5173';
let cookie = '';
async function request(route, method = 'GET', body) {
  const response = await fetch(origin + route, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const next = response.headers.get('set-cookie'); if (next) cookie = next.split(';')[0];
  return { status: response.status, data: await response.json() };
}
const email = `qa-${Date.now()}@frame.example.test`;
const password = 'Frame-QA-Local-2026!';
let result = await request('/api/auth/register', 'POST', { name: 'Local Cinema QA', email, password });
assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.user.email, email);
assert.equal((await request('/api/auth/me')).data.user.email, email);
const catalog = await request('/api/movies?category=trending');
assert.equal(catalog.status, 200); assert.ok(catalog.data.movies.length > 0);
const movie = catalog.data.movies[0];
assert.equal((await request('/api/watchlist', 'PUT', { movie })).status, 200);
assert.equal((await request('/api/watchlist')).data.movies[0].id, movie.id);
assert.equal((await request(`/api/watchlist?id=${encodeURIComponent(movie.id)}`, 'DELETE')).status, 200);
assert.equal((await request('/api/watchlist')).data.movies.length, 0);
assert.equal((await request('/api/auth/logout', 'POST', {})).status, 200);
assert.equal((await request('/api/watchlist')).status, 401);
assert.equal((await request('/api/auth/login', 'POST', { email, password: 'wrong-password' })).status, 401);
assert.equal((await request('/api/auth/login', 'POST', { email, password })).status, 200);
const reset = await request('/api/auth/forgot-password', 'POST', { email });
assert.equal(reset.status, 503); assert.match(reset.data.error, /not configured/);
await request('/api/auth/logout', 'POST', {});
console.log(JSON.stringify({ ok: true, registration: true, login: true, authenticatedWatchlist: true, logout: true, mailConfigurationHonest: true, movieSource: catalog.data.source, movieCount: catalog.data.movies.length }));
