import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { connectA2A, send } from './a2a-client.js';

async function main() {
  const client = await connectA2A();
  console.log('Conectado a Parachute S.A. mediante A2A. /salir termina; /nuevo reinicia la conversación.');
  let contextId;
  const ask = async text => {
    const result = await send(client, text, contextId);
    contextId = result.contextId;
    console.log(`Parachute: ${result.respuesta}\n[task=${result.task.id || '-'} context=${contextId}]`);
  };
  const message = process.argv.slice(2).join(' ');
  if (message) return ask(message);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const text = (await rl.question('Tú: ')).trim();
      if (text === '/salir') break;
      if (text === '/nuevo') { contextId = undefined; continue; }
      if (!text) continue;
      try { await ask(text); } catch (error) { console.error(error.message); }
    }
  } finally { rl.close(); }
}
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
