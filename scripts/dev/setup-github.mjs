#!/usr/bin/env node
/**
 * setup-github.mjs — configura el repositorio en GitHub (idempotente).
 *
 * Crea/actualiza:
 *   - etiquetas (labels) del flujo de trabajo
 *   - hitos (milestones) de las 12 fases
 *   - protección de ramas main y develop
 *   - topics y metadatos del repositorio
 *
 * Uso:
 *   GITHUB_TOKEN=... node scripts/dev/setup-github.mjs --labels --milestones --topics
 *   GITHUB_TOKEN=... node scripts/dev/setup-github.mjs --protection
 *   GITHUB_TOKEN=... node scripts/dev/setup-github.mjs --all
 *
 * Permisos requeridos del token (fine-grained, sobre este repositorio):
 *   - Contents:                         Read and write  (no estrictamente necesario aquí)
 *   - Issues:                           Read and write  (labels y milestones)
 *   - Administration:                   Read and write  (protección de ramas y metadatos)
 *
 * NOTA sobre protección de ramas: en repositorios PRIVADOS requiere plan de pago
 * (Pro/Team) o repositorio público. Es una limitación de GitHub, no del script.
 *
 * El script nunca imprime el token ni lo escribe en disco.
 */

const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const REPO = process.env.GITHUB_REPOSITORY || 'MrCastilloF/Hacienda_Ganadera';

const args = new Set(process.argv.slice(2));
const ALL = args.has('--all') || args.size === 0;
const want = (flag) => ALL || args.has(flag);

if (!TOKEN) {
  console.error('Falta GITHUB_TOKEN (o GH_TOKEN) en el entorno.');
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'hacienda-setup',
  'Content-Type': 'application/json; charset=utf-8',
};

let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

function report(ok, message, detail) {
  if (ok) {
    console.log(`  ok    ${message}`);
  } else {
    failures++;
    console.log(`  FALLO ${message}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Etiquetas ────────────────────────────────────────────────────────────────
const LABELS = [
  ['tipo: feat', '1f6feb', 'Funcionalidad nueva'],
  ['tipo: bug', 'd73a4a', 'Defecto o comportamiento incorrecto'],
  ['tipo: docs', '0075ca', 'Documentación'],
  ['tipo: refactor', '8250df', 'Cambio interno sin cambio de comportamiento'],
  ['tipo: test', '0e8a16', 'Pruebas'],
  ['tipo: chore', 'cfd3d7', 'Mantenimiento'],
  ['tipo: seguridad', 'b60205', 'Afecta autenticación, autorización o datos sensibles'],
  ['prioridad: bloqueante', 'b60205', 'Impide avanzar con la fase'],
  ['prioridad: alta', 'd93f0b', 'Resolver en la fase actual'],
  ['prioridad: media', 'fbca04', 'Resolver cuando se pueda'],
  ['prioridad: baja', 'c2e0c6', 'Mejora menor'],
  ['hardware', '5319e7', 'Requiere dispositivo físico o su simulador'],
  ['simulado', 'bfd4f2', 'Se valida con simulador, no con hardware real'],
  ['adr requerido', '8b5cf6', 'Decisión estructural que debe registrarse'],
  ['necesita confirmación', 'f9d0c4', 'Bloqueado por una decisión del cliente'],
  ['invariante', '000000', 'Afecta una regla inviolable INV-01..INV-12'],
  ['base de datos', '006b75', 'Esquema, migraciones, índices o rendimiento'],
  ['sincronización', 'c5def5', 'Offline, outbox, conflictos, HLC'],
  ['iot', '1d76db', 'LoRaWAN, tags, gateways, telemetría'],
  ['deps', '0366d6', 'Actualización de dependencias'],
  ['ci', '6f42c1', 'Pipeline y automatización'],
  ['fuera de alcance', 'ffffff', 'Explícitamente excluido del proyecto'],
];

async function setupLabels() {
  console.log('\nEtiquetas');
  const existing = await call('GET', `/repos/${REPO}/labels?per_page=100`);
  if (!existing.ok) {
    report(false, 'leer etiquetas', existing.data?.message);
    return;
  }
  const byName = new Map(existing.data.map((l) => [l.name, l]));

  for (const [name, color, description] of LABELS) {
    if (byName.has(name)) {
      const r = await call('PATCH', `/repos/${REPO}/labels/${encodeURIComponent(name)}`, { color, description });
      report(r.ok, `actualizar «${name}»`, r.data?.message);
    } else {
      const r = await call('POST', `/repos/${REPO}/labels`, { name, color, description });
      report(r.ok, `crear «${name}»`, r.data?.message);
    }
  }
}

// ── Hitos ────────────────────────────────────────────────────────────────────
const MILESTONES = [
  ['F0 - Especificación y arquitectura', 'Validación, especificación v2, arquitectura, modelo de datos, repositorio y CI. Entregado 2026-11-10.'],
  ['F1 - Arquitectura y seguridad', 'Docker, PostgreSQL/PostGIS, backend, seguridad y autenticación.'],
  ['F2 - Animales e inventario', 'Animales, identificación, usuarios, roles e inventario.'],
  ['F3 - Báscula y Local Bridge', 'Báscula, códigos de barras y Local Bridge.'],
  ['F4 - Pesajes y crecimiento', 'Pesajes, crecimiento y reportes relacionados.'],
  ['F5 - Veterinaria y salud', 'Historia clínica, vacunación, tratamientos y alertas sanitarias.'],
  ['F6 - Reproducción y genética', 'Reproducción, nacimientos y genealogía.'],
  ['F7 - Alimentación y potreros', 'Alimentación, potreros y movimientos.'],
  ['F8 - Compras, ventas y finanzas', 'Compras, ventas y costeo operativo.'],
  ['F9 - LoRaWAN', 'LoRaWAN, tags y gateways.'],
  ['F10 - Mapas y geocercas', 'GPS/GNSS, mapas, PostGIS y geocercas.'],
  ['F11 - Dashboard y reportes', 'Dashboard, notificaciones, reportes y analítica.'],
  ['F12 - Offline y despliegue', 'Offline/PWA, sincronización, hardening, carga, documentación y despliegue.'],
];

async function setupMilestones() {
  console.log('\nHitos');
  const existing = await call('GET', `/repos/${REPO}/milestones?state=all&per_page=100`);
  if (!existing.ok) {
    report(false, 'leer hitos', existing.data?.message);
    return;
  }
  const titles = new Set(existing.data.map((m) => m.title));

  for (const [title, description] of MILESTONES) {
    if (titles.has(title)) {
      console.log(`  ok    «${title}» ya existe`);
      continue;
    }
    const r = await call('POST', `/repos/${REPO}/milestones`, { title, description, state: 'open' });
    report(r.ok, `crear «${title}»`, r.data?.message);
  }
}

// ── Topics y metadatos ───────────────────────────────────────────────────────
const TOPICS = [
  'agriculture', 'livestock', 'traceability', 'postgis', 'lorawan',
  'offline-first', 'nestjs', 'nextjs', 'pwa', 'iot',
];

async function setupTopics() {
  console.log('\nTopics y metadatos');
  const t = await call('PUT', `/repos/${REPO}/topics`, { names: TOPICS });
  report(t.ok, 'topics', t.data?.message);

  const v = await call('PUT', `/repos/${REPO}/vulnerability-alerts`);
  report(v.ok, 'alertas de vulnerabilidades', v.data?.message);

  const m = await call('PATCH', `/repos/${REPO}`, {
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: true,
    delete_branch_on_merge: true,
    has_issues: true,
    has_wiki: false,
  });
  report(m.ok, 'política de merge', m.data?.message);
}

// ── Protección de ramas ──────────────────────────────────────────────────────
const MAIN_PROTECTION = {
  required_status_checks: { strict: true, contexts: ['ci'] },
  enforce_admins: true,
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true,
};

const DEVELOP_PROTECTION = {
  required_status_checks: { strict: false, contexts: ['ci'] },
  enforce_admins: false,
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
};

async function setupProtection() {
  console.log('\nProtección de ramas');
  for (const [branch, body] of [['main', MAIN_PROTECTION], ['develop', DEVELOP_PROTECTION]]) {
    const r = await call('PUT', `/repos/${REPO}/branches/${branch}/protection`, body);
    if (r.status === 403) {
      console.log(`  FALLO ${branch} — GitHub exige plan Pro/Team para repos privados, o repositorio público.`);
      failures++;
    } else {
      report(r.ok, `proteger ${branch}`, r.data?.message);
    }
  }
}

// ── Ejecución ────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Repositorio: ${REPO}`);

  const me = await call('GET', '/user');
  if (!me.ok) {
    console.error(`Token inválido o sin acceso: ${me.data?.message ?? me.status}`);
    process.exit(2);
  }
  console.log(`Autenticado como: ${me.data.login}`);

  if (want('--labels')) await setupLabels();
  if (want('--milestones')) await setupMilestones();
  if (want('--topics')) await setupTopics();
  if (want('--protection')) await setupProtection();

  console.log('');
  if (failures > 0) {
    console.error(`${failures} operación(es) fallaron. Revisa los permisos del token (Issues: RW, Administration: RW).`);
    process.exit(1);
  }
  console.log('Configuración de GitHub aplicada.');
})();
