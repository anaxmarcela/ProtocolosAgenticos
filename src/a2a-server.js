import { config, log } from './config.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { A2A_PROTOCOL_VERSION, AGENT_CARD_PATH, Role, TaskState } from '@a2a-js/sdk';
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { TaskNotCancelableError } from '@a2a-js/sdk/errors';
import { runAgent } from './multi-agent.js';

const part = text => ({ content: { $case: 'text', value: text }, mediaType: 'text/plain', filename: '' });
const sessions = new Map();
const busy = new Set();
const card = {
  name: 'Parachute S.A.', version: '1.0.0',
  description: 'Sistema multiagente de atención: preguntas frecuentes y gestión de citas.',
  supportedInterfaces: [{ url: `${config.a2aUrl}/`, protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }],
  capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
  defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
  skills: [
    { id: 'preguntas_frecuentes', name: 'Preguntas frecuentes', description: 'Horario, costo, virtualidad, cancelación, ubicación y pagos.', tags: ['faq'], examples: ['¿Cuánto cuesta la consulta?'] },
    { id: 'agendar_cita', name: 'Agendar cita', description: 'Reserva con nombre, fecha, hora y correo.', tags: ['citas'], examples: ['Agenda para Ana el 2026-11-02 a las 10:00, ana@example.com'] },
    { id: 'consultar_cita', name: 'Consultar cita', description: 'Consulta una reserva por identificador.', tags: ['citas'], examples: ['Consulta APT_0001'] },
  ],
};
class ParachuteExecutor {
  async cancelTask() { throw new TaskNotCancelableError('Esta tarea no admite cancelación.'); }
  async execute(ctx, bus) {
    const { taskId, contextId } = ctx;
    const status = (state, text) => {
      bus.publish(AgentEvent.statusUpdate({ taskId, contextId, status: {
        state, timestamp: new Date().toISOString(),
        message: text ? { messageId: randomUUID(), role: Role.ROLE_AGENT, parts: [part(text)], taskId, contextId } : undefined,
      } }));
      log('A2A', 'task.status', { taskId, contextId, state: TaskState[state] });
    };
    bus.publish(AgentEvent.task(ctx.task || { id: taskId, contextId,
      status: { state: TaskState.TASK_STATE_SUBMITTED }, history: [ctx.userMessage], artifacts: [] }));
    if (busy.has(contextId)) {
      status(TaskState.TASK_STATE_FAILED, 'Espera a que termine la solicitud anterior de esta conversación.');
      return;
    }
    busy.add(contextId);
    try {
      status(TaskState.TASK_STATE_WORKING);
      const text = ctx.userMessage.parts.filter(p => p.content?.$case === 'text').map(p => p.content.value).join('\n').trim();
      if (!text) throw new Error('Envía un mensaje de texto.');
      const history = sessions.get(contextId) || [];
      sessions.set(contextId, history);
      const result = await runAgent(text, { history, traceId: taskId });
      bus.publish(AgentEvent.artifactUpdate({ taskId, contextId, lastChunk: true, append: false,
        artifact: { artifactId: randomUUID(), name: 'respuesta', parts: [part(result.respuesta)],
          metadata: { herramientas: result.herramientas } } }));
      status(TaskState.TASK_STATE_COMPLETED);
    } catch (error) {
      log('A2A', 'task.error', { taskId, error: error.message });
      status(TaskState.TASK_STATE_FAILED, 'No fue posible completar la solicitud. Revisa los logs del servidor A2A y la configuración de MCP/Gemini.');
    } finally { busy.delete(contextId); }
  }
}
const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new ParachuteExecutor());
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, mode: config.mode }));
app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: handler }));
app.use(jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
app.listen(config.a2aPort, config.a2aHost, () => log('A2A', 'listening', { url: config.a2aUrl, mode: config.mode }));
