import { randomUUID } from 'node:crypto';
import { Role, TaskState } from '@a2a-js/sdk';
import { ClientFactory } from '@a2a-js/sdk/client';
import { config } from './config.js';

export async function connectA2A(url = config.a2aUrl) {
  return new ClientFactory().createFromUrl(url);
}
export async function send(client, text, contextId) {
  const task = await client.sendMessage({ message: {
    messageId: randomUUID(), role: Role.ROLE_USER, contextId,
    parts: [{ content: { $case: 'text', value: text }, mediaType: 'text/plain' }],
  } }, { signal: AbortSignal.timeout(180000) });
  const respuesta = task.artifacts?.flatMap(a => a.parts)
    .filter(p => p.content?.$case === 'text').map(p => p.content.value).join('\n') ||
    task.parts?.filter(p => p.content?.$case === 'text').map(p => p.content.value).join('\n') ||
    task.status?.message?.parts?.map(p => p.content?.value || '').join('\n') || '';
  if (task.status?.state === TaskState.TASK_STATE_FAILED) throw new Error(respuesta || 'La tarea A2A falló.');
  return { respuesta, contextId: task.contextId, task };
}
