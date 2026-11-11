#!/usr/bin/env node
/**
 * e2e.mjs — prueba de humo de extremo a extremo sobre la plataforma en marcha.
 *
 *   pnpm dev            (en otra terminal)
 *   pnpm test:e2e
 *
 * Variables: API_URL (por defecto http://127.0.0.1:3100), WEB_URL, E2E_EMAIL,
 * E2E_PASSWORD.
 *
 * No sustituye a Playwright (Fase 12): verifica que la cadena real —login,
 * token, permisos, auditoría y render de la web— funciona contra los servicios
 * levantados, que es exactamente lo que se rompe cuando algo se integra mal.
 */

const API = process.env.API_URL ?? 'http://127.0.0.1:3100';
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.E2E_EMAIL ?? 'admin@hacienda.local';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

let fallos = 0;
const resultados = [];

function check(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle });
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✖'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

async function get(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, redirect: 'manual' });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers };
  } catch (error) {
    return { status: 0, text: String(error?.message ?? error), headers: {} };
  }
}

console.log(`\n  Prueba de humo · API ${API} · Web ${WEB}\n`);

// 1. Sondas
const health = await get(`${API}/health`);
check('API responde /health', health.status === 200, `status ${health.status}`);

const ready = await get(`${API}/ready`);
check('API responde /ready con base de datos', ready.status === 200 && ready.text.includes('"database":"ok"'), `status ${ready.status}`);

// 2. Protección por defecto
const sinToken = await get(`${API}/api/v1/usuarios`);
check('endpoint protegido sin token devuelve 401', sinToken.status === 401, `status ${sinToken.status}`);

// 3. Autenticación
if (!PASSWORD) {
  console.log('\n  ⚠ E2E_PASSWORD no definido: se omite el flujo autenticado.');
  console.log('    Ejemplo: E2E_PASSWORD=... pnpm test:e2e\n');
  process.exit(fallos > 0 ? 1 : 0);
}

const login = await get(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});

check('login devuelve 200 y un token', login.status === 200 && login.text.includes('accessToken'), `status ${login.status}`);

const accessToken = (() => {
  try {
    const parsed = JSON.parse(login.text);
    return typeof parsed?.accessToken === 'string' ? parsed.accessToken : null;
  } catch {
    return null;
  }
})();

if (accessToken) {
  const auth = { headers: { authorization: `Bearer ${accessToken}` } };

  const me = await get(`${API}/api/v1/auth/me`, auth);
  check('/auth/me devuelve el perfil con permisos', me.status === 200 && me.text.includes('permisos'), `status ${me.status}`);

  const usuarios = await get(`${API}/api/v1/usuarios`, auth);
  check('/usuarios permite la consulta autorizada', usuarios.status === 200, `status ${usuarios.status}`);

  const auditoria = await get(`${API}/api/v1/auditoria/verificar`, auth);
  const integra = auditoria.status === 200 && auditoria.text.includes('"integra":true');
  check('cadena de auditoría íntegra', integra, `status ${auditoria.status}`);

  const malformado = await get(`${API}/api/v1/usuarios`, { headers: { authorization: 'Bearer x' } });
  check('token inválido devuelve 401', malformado.status === 401, `status ${malformado.status}`);
}

// 4. Web
const webLogin = await get(`${WEB}/login`);
check('la web sirve la pantalla de ingreso', webLogin.status === 200 && /Contrase|password/i.test(webLogin.text), `status ${webLogin.status}`);

const webPanel = await get(`${WEB}/panel`);
check('la web exige sesión para el panel', webPanel.status === 307 || webPanel.status === 302, `status ${webPanel.status}`);

console.log('');
if (fallos > 0) {
  console.error(`  ${fallos} verificación(es) fallaron\n`);
  process.exit(1);
}
console.log('  ✔ prueba de humo correcta\n');
