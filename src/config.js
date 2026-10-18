import 'dotenv/config';
export const config = {
  mode: process.env.AGENT_MODE || 'gemini',
  model: process.env.AGENT_MODEL || 'gemini-3.5-flash-lite',
  mcpHost: process.env.MCP_HOST || '127.0.0.1',
  mcpPort: Number(process.env.MCP_PORT || 3001),
  mcpUrl: process.env.MCP_URL || 'http://127.0.0.1:3001/mcp',
  a2aHost: process.env.A2A_HOST || '127.0.0.1',
  a2aPort: Number(process.env.A2A_PORT || 3000),
  a2aUrl: process.env.A2A_URL || 'http://127.0.0.1:3000',
};
export function log(component, event, fields = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), component, event, ...fields }));
}
