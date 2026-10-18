import { config, log } from './config.js';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { buscarFaq, agendarCita, consultarCita } from './business.js';

function createServer() {
  const server = new McpServer({ name: 'parachute-tools', version: '1.0.0' });
  const tool = (name, description, inputSchema, fn) => server.registerTool(name,
    { description, inputSchema }, async (args) => {
      const start = Date.now();
      log('MCP', 'tool.start', { tool: name });
      try {
        const result = fn(args);
        log('MCP', 'tool.end', { tool: name, durationMs: Date.now() - start,
          success: result.exito ?? result.encontrada });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        log('MCP', 'tool.error', { tool: name, error: error.message });
        return { isError: true, content: [{ type: 'text', text: 'Error al ejecutar la herramienta.' }] };
      }
    });
  tool('buscar_faq', 'Busca información oficial: horario, costo, virtualidad, cancelación, ubicación y pagos.',
    { pregunta: z.string().min(1) }, buscarFaq);
  tool('agendar_cita', 'Agenda solo con nombre, fecha YYYY-MM-DD, hora HH:MM y correo completos.',
    { nombre: z.string().min(1), fecha: z.string(), hora: z.string(), correo: z.string() }, agendarCita);
  tool('consultar_cita', 'Consulta una cita por identificador APT_0001.',
    { id_cita: z.string().min(1) }, consultarCita);
  server.registerResource('politicas', 'parachute://politicas',
    { description: 'Políticas oficiales de Parachute', mimeType: 'text/plain' }, async (uri) => ({
      contents: [{ uri: uri.href, text: 'Atención: lunes a viernes 09:00–18:00. Citas: 09:00–17:00. Consulta: Q250. Cancelación sin costo con 24 horas; después Q100.' }],
    }));
  server.registerPrompt('atencion_cliente', { description: 'Guía de atención de Parachute',
    argsSchema: { consulta: z.string() } }, ({ consulta }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Responde en español con herramientas oficiales. No inventes datos. Consulta: ${consulta}` } }],
    }));
  return server;
}
const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/health', (_req, res) => res.json({ ok: true, transport: 'streamable-http' }));
app.post('/mcp', async (req, res) => {
  // Transporte stateless: una conexión por petición, herramientas y datos compartidos.
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    log('MCP', 'request.error', { error: error.message });
    if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
  }
});
app.all('/mcp', (_req, res) => res.status(405).end());
app.listen(config.mcpPort, config.mcpHost, () => log('MCP', 'listening', { port: config.mcpPort, transport: 'streamable-http' }));
