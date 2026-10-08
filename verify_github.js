// Verificador completo de despliegue — PixelLibre en GitHub Pages
// Uso: node verify_github.js
// Genera verificacion_github.txt con TODA la información (git, Actions, jobs, pasos, web en vivo).
const fs = require('fs');
const { execSync } = require('child_process');

const REPO = 'Cha0smagick/free-image-tools-web';
const SITE = 'https://cha0smagick.github.io/free-image-tools-web';
const OUT = 'verificacion_github.txt';
const HDRS = { 'User-Agent': 'pixellibre-verifier', 'Accept': 'application/vnd.github+json' };

const lines = [];
const L = (s) => lines.push(s === undefined ? '' : String(s));

async function main() {
  L('================================================================');
  L('VERIFICACIÓN COMPLETA — PixelLibre en GitHub Pages');
  L('Generada: ' + new Date().toISOString());
  L('Repo: https://github.com/' + REPO);
  L('Web:  ' + SITE + '/');
  L('================================================================');

  // 1. GIT LOCAL
  L('');
  L('--- 1. GIT LOCAL ---');
  try { L('remote:'); L(execSync('git remote -v', { encoding: 'utf8' }).trim()); }
  catch (e) { L('remote: ERROR — ' + e.message); }
  try { L('ultimo commit: ' + execSync('git log -1 --format="%h %s (%ci)"', { encoding: 'utf8' }).trim()); }
  catch (e) { L('ultimo commit: ERROR — ' + e.message); }
  try { L('estado:'); L(execSync('git status --short', { encoding: 'utf8' }).trim() || '(limpio)'); }
  catch (e) { L('estado: ERROR — ' + e.message); }

  // 2. GITHUB ACTIONS — RUNS
  L('');
  L('--- 2. GITHUB ACTIONS: WORKFLOW RUNS (API) ---');
  const runsRes = await fetch('https://api.github.com/repos/' + REPO + '/actions/runs', { headers: HDRS });
  L('HTTP ' + runsRes.status + ' GET /repos/' + REPO + '/actions/runs');
  if (!runsRes.ok) {
    L('ERROR: no se pudo leer la API de Actions (¿repo privado o sin workflow?).');
    throw new Error('api runs failed ' + runsRes.status);
  }
  const runsData = await runsRes.json();
  L('total_workflow_runs=' + runsData.total_count);
  for (const r of (runsData.workflow_runs || [])) {
    L('');
    L('RUN id=' + r.id + ' | ' + r.name);
    L('  status=' + r.status + ' | conclusion=' + r.conclusion);
    L('  event=' + r.event + ' | branch=' + r.head_branch + ' | sha=' + String(r.head_sha).slice(0, 7));
    L('  created=' + r.created_at + ' | updated=' + r.updated_at);
    L('  url=' + r.html_url);
  }

  // 3. JOBS Y PASOS
  L('');
  L('--- 3. GITHUB ACTIONS: JOBS Y PASOS (detalle completo) ---');
  for (const r of (runsData.workflow_runs || [])) {
    const jobsRes = await fetch('https://api.github.com/repos/' + REPO + '/actions/runs/' + r.id + '/jobs', { headers: HDRS });
    L('');
    L('RUN ' + r.id + ' — HTTP ' + jobsRes.status);
    if (!jobsRes.ok) { L('  ERROR leyendo jobs'); continue; }
    const jobsData = await jobsRes.json();
    for (const j of (jobsData.jobs || [])) {
      L('  JOB "' + j.name + '" | status=' + j.status + ' | conclusion=' + j.conclusion + ' | runner=' + (j.runner_name || '-'));
      L('  started=' + j.started_at + ' | completed=' + j.completed_at);
      for (const s of (j.steps || [])) {
        L('    step "' + s.name + '" | ' + s.status + ' | ' + (s.conclusion || '-'));
      }
    }
  }

  // 4. WEB EN VIVO
  L('');
  L('--- 4. WEB EN VIVO ---');
  const routes = ['/', '/css/styles.css', '/js/app.js', '/js/tools.js', '/js/background.js', '/manifest.webmanifest', '/icons/icon.svg'];
  for (const p of routes) {
    try {
      const res = await fetch(SITE + p);
      let extra = '';
      if (res.ok) {
        const body = await res.text();
        if (p === '/') extra = ' | title=' + ((body.match(/<title>([^<]*)<\/title>/) || [])[1] || '-');
        else if (p === '/manifest.webmanifest') extra = ' | name=' + ((JSON.parse(body).name) || '-');
        else extra = ' | bytes=' + body.length;
      }
      L('HTTP ' + res.status + ' ' + p + extra);
    } catch (e) {
      L('HTTP ERROR ' + p + ' — ' + e.message);
    }
  }

  // 5. VEREDICTO
  L('');
  L('--- 5. VEREDICTO ---');
  const lastRun = (runsData.workflow_runs || [])[0];
  const green = lastRun && lastRun.conclusion === 'success';
  L('Workflow "' + (lastRun ? lastRun.name : '-') + '" → ' + (lastRun ? (lastRun.conclusion || lastRun.status) : 'sin runs'));
  L('Web ' + SITE + '/ → (ver sección 4)');
  if (green) L('✔ El workflow está en verde. Si la sección 4 muestra HTTP 200 en las 7 rutas, la web está publicada y funcionando.');
  else L('✘ El workflow NO está en verde. Sigue: Settings → Pages → Build and deployment → Source: "GitHub Actions" → Actions → corrida fallida → "Re-run all jobs".');

  fs.writeFileSync(OUT, lines.join('\r\n'), 'utf8');
  console.log('OK ' + OUT + ' (' + lines.length + ' líneas)');
  console.log('Workflow: ' + (lastRun ? (lastRun.conclusion || lastRun.status) : 'sin runs'));
}

main().catch((e) => {
  try { fs.writeFileSync(OUT, lines.join('\r\n') + '\r\n\r\nERROR FATAL: ' + e.message + '\r\n', 'utf8'); } catch (_) { /* noop */ }
  console.log('ERROR: ' + e.message);
});
