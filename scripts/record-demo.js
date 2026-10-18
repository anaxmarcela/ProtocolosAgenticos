// Captura stdout/stderr reales de los servidores y de la CLI; no fabrica respuestas.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const folder = await mkdtemp(join(tmpdir(), 'parachute-video-'));
const env = { ...process.env, AGENT_MODE: 'demo', MCP_PORT: '14001', A2A_PORT: '14000',
  MCP_URL: 'http://127.0.0.1:14001/mcp', A2A_URL: 'http://127.0.0.1:14000',
  APPOINTMENTS_FILE: join(folder, 'citas.json') };
const events = [];
const started = Date.now();
const record = (panel, text) => {
  events.push({ time: (Date.now() - started) / 1000, panel, text: text.toString() });
  process.stdout.write(`[${panel}] ${text}`);
};
const children = [];
function launch(panel, args) {
  record(panel, `$ node ${args.join(' ')}\n`);
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => record(panel, data));
  child.stderr.on('data', data => record(panel, data));
  children.push(child);
  return child;
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* arranque */ }
    await delay(100);
  }
  throw new Error(`No inició ${url}`);
}
try {
  launch('MCP', ['src/mcp-server.js']);
  launch('A2A', ['src/a2a-server.js']);
  await Promise.all([ready('http://127.0.0.1:14001/health'), ready('http://127.0.0.1:14000/health')]);
  const card = await (await fetch(`${env.A2A_URL}/.well-known/agent-card.json`)).json();
  record('CLIENTE', `Agent Card: ${card.name}; skills: ${card.skills.map(s => s.id).join(', ')}\n`);
  const booking = '/agendar {"nombre":"Ana Prueba","fecha":"2026-11-02","hora":"10:00","correo":"ana@example.com"}';
  for (const message of ['/faq ¿Cuánto cuesta la consulta?', booking, '/consultar APT_0001', booking]) {
    const child = launch('CLIENTE', ['src/cli.js', message]);
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error('La CLI falló.');
    await delay(500);
  }
  record('CLIENTE', 'FIN: FAQ, reserva, consulta y rechazo de horario ocupado comprobados por A2A y MCP.\n');
  await mkdir('docs/evidencia', { recursive: true });
  await writeFile('docs/evidencia/demo-events.json', JSON.stringify(events, null, 2));
  const cast = [JSON.stringify({ version: 2, width: 150, height: 40,
    title: 'Parachute: salida real A2A + MCP, modo demo sin Gemini' }),
    ...events.map(e => JSON.stringify([e.time, 'o', `[${e.panel}] ${e.text.replace(/\r?\n/g, '\r\n')}`]))];
  await writeFile('docs/evidencia/demo.cast', cast.join('\n') + '\n');
} finally {
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exit = once(child, 'exit'); child.kill(); await exit;
  }
  await rm(folder, { recursive: true, force: true });
}
