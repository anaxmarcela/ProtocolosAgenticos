import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { TaskState, Role } from '@a2a-js/sdk';
import { ClientFactory } from '@a2a-js/sdk/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { send } from '../src/a2a-client.js';
import { config } from '../src/config.js';
import { runAgent } from '../src/multi-agent.js';

test('Terminal → A2A → MAS → MCP Streamable HTTP, persistencia y errores', { timeout: 45000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'parachute-test-'));
  const mcpPort = 13001, a2aPort = 13000;
  const env = { ...process.env, AGENT_MODE: 'demo', MCP_PORT: String(mcpPort),
    A2A_PORT: String(a2aPort), MCP_URL: `http://127.0.0.1:${mcpPort}/mcp`,
    A2A_URL: `http://127.0.0.1:${a2aPort}`, APPOINTMENTS_FILE: join(dir, 'citas.json') };
  let logs = '';
  const children = [];
  const start = (file, args = []) => {
    const child = spawn(process.execPath, [file, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.stdout.on('data', b => { logs += b; });
    child.stderr.on('data', b => { logs += b; });
    return child;
  };
  const stop = async child => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  };
  t.after(async () => {
    for (const child of children) await stop(child);
    await rm(dir, { recursive: true, force: true });
  });
  const ready = async url => {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url)).ok) return; } catch { /* Esperar al listener. */ }
      await delay(100);
    }
    throw new Error(`Servidor no inició: ${logs}`);
  };
  let mcp = start('src/mcp-server.js');
  start('src/a2a-server.js');
  await Promise.all([ready(`http://127.0.0.1:${mcpPort}/health`), ready(`${env.A2A_URL}/health`)]);
  // La validación Origin debe preceder al parser y aplicarse también a GET.
  for (const origin of ['https://untrusted.example', 'null', `http://127.0.0.1:${mcpPort}.untrusted.example`]) {
    for (const method of ['GET', 'POST']) {
      const response = await fetch(env.MCP_URL, { method, headers: { Origin: origin } });
      assert.equal(response.status, 403);
    }
  }
  const trusted = new Client({ name: 'trusted-origin-test', version: '1' });
  try {
    await trusted.connect(new StreamableHTTPClientTransport(new URL(env.MCP_URL), {
      requestInit: { headers: { Origin: `http://localhost:${mcpPort}` } },
    }));
    assert.equal((await trusted.listTools()).tools.length, 3);
  } finally { await trusted.close(); }
  const cli = start('src/cli.js', ['/faq costo']);
  let cliOutput = '';
  cli.stdout.on('data', b => { cliOutput += b; });
  assert.equal((await once(cli, 'exit'))[0], 0);
  assert.match(cliOutput, /Q250/);
  assert.match(cliOutput, /task=.*context=/);
  const discovery = await fetch(`${env.A2A_URL}/.well-known/agent-card.json`);
  const card = await discovery.json();
  assert.equal(card.skills.length, 3);
  const client = await new ClientFactory().createFromUrl(env.A2A_URL);
  const faq = await send(client, '/faq ¿Cuánto cuesta la consulta?');
  assert.match(faq.respuesta, /Q250/);
  assert.equal(faq.task.status.state, TaskState.TASK_STATE_COMPLETED);
  assert.ok((await client.getTask({ id: faq.task.id })).artifacts.length);
  const unknown = await send(client, '/faq dinosaurios');
  assert.match(unknown.respuesta, /No cuento con esa información/);
  const args = { nombre: 'Ana Prueba', fecha: '2026-11-02', hora: '10:00', correo: 'ana@example.com' };
  const booking = await send(client, `/agendar ${JSON.stringify(args)}`, faq.contextId);
  const booked = JSON.parse(booking.respuesta);
  assert.equal(booked.exito, true);
  assert.equal(booking.contextId, faq.contextId);
  assert.equal(JSON.parse((await send(client, `/agendar ${JSON.stringify(args)}`)).respuesta).exito, false);
  assert.equal(JSON.parse((await send(client, `/agendar ${JSON.stringify({ ...args, fecha: '2026-02-30' })}`)).respuesta).exito, false);
  assert.equal(JSON.parse((await send(client, `/agendar ${JSON.stringify({ ...args, fecha: '2026-11-01' })}`)).respuesta).exito, false);
  assert.equal(JSON.parse((await send(client, `/agendar ${JSON.stringify({ ...args, hora: '18:00' })}`)).respuesta).exito, false);
  assert.equal(JSON.parse((await send(client, '/consultar APT_9999')).respuesta).exito, false);
  await assert.rejects(send(client, '/agendar {}'), /No fue posible/);
  // El stream debe contener estados y artefacto reales del SDK.
  const events = [];
  for await (const event of client.sendMessageStream({ message: {
    messageId: crypto.randomUUID(), role: Role.ROLE_USER,
    parts: [{ content: { $case: 'text', value: '/faq horario' }, mediaType: 'text/plain' }],
  } })) events.push(event);
  assert.ok(events.length >= 4);
  const direct = new Client({ name: 'integration-test', version: '1' });
  await direct.connect(new StreamableHTTPClientTransport(new URL(env.MCP_URL)));
  try {
    assert.equal((await direct.listTools()).tools.length, 3);
    assert.equal((await direct.listResources()).resources.length, 1);
    assert.equal((await direct.listPrompts()).prompts.length, 1);
    assert.match((await direct.readResource({ uri: 'parachute://politicas' })).contents[0].text, /Q250/);
    assert.ok((await direct.getPrompt({ name: 'atencion_cliente', arguments: { consulta: 'horario' } })).messages.length);
  } finally { await direct.close(); }
  await stop(mcp);
  mcp = start('src/mcp-server.js');
  await ready(`http://127.0.0.1:${mcpPort}/health`);
  assert.equal(JSON.parse((await send(client, `/consultar ${booked.id_cita}`)).respuesta).nombre, args.nombre);
  // Verifica el ciclo real de coordinador/especialista con respuestas del modelo
  // controladas; MCP sigue siendo el servidor real. No consume Gemini.
  const saved = { mode: config.mode, mcpUrl: config.mcpUrl };
  config.mode = 'gemini'; config.mcpUrl = env.MCP_URL;
  try {
    const seen = [];
    const call = (name, args) => ({ functionCalls: [{ name, args }], candidates: [{ content: {
      role: 'model', parts: [{ functionCall: { name, args } }],
    } }] });
    const reply = text => ({ text, candidates: [{ content: { role: 'model', parts: [{ text }] } }] });
    const responses = [call('delegar_faq', { consulta: '¿Cuánto cuesta?' }),
      call('buscar_faq', { pregunta: 'costo' }), reply('La consulta cuesta Q250.'), reply('La consulta cuesta Q250.')];
    const modelClient = { models: { generateContent: async request => {
      seen.push(structuredClone(request));
      assert.ok(responses.length, 'No deben aparecer turnos adicionales');
      return responses.shift();
    } } };
    const history = [];
    const result = await runAgent('¿Cuánto cuesta?', { modelClient, history });
    assert.match(result.respuesta, /Q250/);
    assert.equal(result.herramientas[0].nombre, 'buscar_faq');
    assert.equal(history.length, 2);
    assert.deepEqual(seen[0].config.tools[0].functionDeclarations.map(t => t.name), ['delegar_faq', 'delegar_citas']);
    assert.deepEqual(seen[1].config.tools[0].functionDeclarations.map(t => t.name), ['buscar_faq']);
    assert.match(JSON.stringify(seen[2].contents), /Q250/);
  } finally { Object.assign(config, saved); }
  await stop(mcp);
  await assert.rejects(send(client, '/faq horario'), /No fue posible/);
  assert.match(logs, /tool.start/);
  assert.match(logs, /tool.end/);
  assert.match(logs, /TASK_STATE_COMPLETED/);
  assert.match(logs, /TASK_STATE_FAILED/);
});
