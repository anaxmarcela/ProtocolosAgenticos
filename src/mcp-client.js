import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from './config.js';

export async function withMcp(fn) {
  const client = new Client({ name: 'parachute-mas', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(config.mcpUrl)));
    return await fn(client);
  } finally {
    await client.close();
  }
}
export async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`Falló la herramienta MCP ${name}`);
  return JSON.parse(result.content.find(p => p.type === 'text').text);
}
