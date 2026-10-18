import { GoogleGenAI } from '@google/genai';
import { config, log } from './config.js';
import { withMcp, callTool } from './mcp-client.js';

const specialists = {
  faq: {
    prompt: 'Eres el especialista de preguntas frecuentes de Parachute S.A. Responde en español. Usa siempre buscar_faq. Solo responde con sus datos. Si no hay respuesta di: No cuento con esa información. Ofrece agendar una cita.',
    tools: ['buscar_faq'],
  },
  citas: {
    prompt: 'Eres el especialista de citas de Parachute S.A. Responde en español. Para agendar necesitas nombre, fecha, hora y correo; pide lo que falte y nunca inventes datos ni confirmes sin éxito de agendar_cita. Usa YYYY-MM-DD y HH:MM de 24 horas. Si no indican año usa 2026. Para consultar usa consultar_cita. Incluye id, fecha y hora en confirmaciones. Explica errores de herramientas.',
    tools: ['agendar_cita', 'consultar_cita'],
  },
};
const delegates = Object.keys(specialists).map(name => ({
  name: `delegar_${name}`,
  description: `Consulta al especialista de ${name === 'faq' ? 'preguntas frecuentes' : 'agendar y consultar citas'}. Incluye todos los datos relevantes de la conversación.`,
  parametersJsonSchema: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] },
}));

// Cada agente tiene instrucciones, herramientas y un ciclo de razonamiento propio.
// La selección de especialistas la hace Gemini mediante function calling.
async function modelLoop(ai, contents, prompt, declarations, execute) {
  for (let turn = 0; turn < 8; turn++) {
    const response = await ai.models.generateContent({
      model: config.model, contents,
      config: { systemInstruction: prompt, tools: [{ functionDeclarations: declarations }] },
    });
    const content = response.candidates?.[0]?.content;
    if (!content) throw new Error('Gemini no devolvió contenido.');
    contents.push(content);
    const calls = response.functionCalls || [];
    if (!calls.length) {
      if (!response.text?.trim()) throw new Error('Gemini devolvió una respuesta vacía.');
      return response.text;
    }
    const parts = [];
    for (const call of calls) {
      const result = await execute(call.name, call.args || {});
      parts.push({ functionResponse: { id: call.id, name: call.name, response: result } });
    }
    contents.push({ role: 'user', parts });
  }
  throw new Error('Se alcanzó el límite de turnos del agente.');
}

export async function runAgent(message, { history = [], traceId, modelClient } = {}) {
  return withMcp(async client => {
    const herramientas = [];
    const invoke = async (name, args) => {
      const resultado = await callTool(client, name, args);
      herramientas.push({ nombre: name, argumentos: args, resultado });
      return resultado;
    };
    if (config.mode === 'demo') {
      // Modo explícito y determinista para probar los transportes, sin simular un LLM.
      let respuesta;
      if (message.startsWith('/agendar ')) {
        log('MAS', 'delegate', { agent: 'citas-demo', traceId });
        respuesta = JSON.stringify(await invoke('agendar_cita', JSON.parse(message.slice(9))));
      } else if (message.startsWith('/consultar ')) {
        log('MAS', 'delegate', { agent: 'citas-demo', traceId });
        respuesta = JSON.stringify(await invoke('consultar_cita', { id_cita: message.slice(11).trim() }));
      } else {
        log('MAS', 'delegate', { agent: 'faq-demo', traceId });
        const result = await invoke('buscar_faq', { pregunta: message.replace(/^\/faq\s*/, '') });
        respuesta = result.respuesta || 'No cuento con esa información. Puedo ayudarte a agendar una cita.';
      }
      return { respuesta, herramientas };
    }
    if (config.mode !== 'gemini') throw new Error('AGENT_MODE debe ser gemini o demo.');
    if (!modelClient && !process.env.GOOGLE_API_KEY) throw new Error('Configura GOOGLE_API_KEY o usa AGENT_MODE=demo.');
    const ai = modelClient || new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const { tools } = await client.listTools();
    const contents = [...history, { role: 'user', parts: [{ text: message }] }];
    const respuesta = await modelLoop(ai, contents,
      'Eres el coordinador de Parachute S.A. Responde siempre en español. Delega TODAS las preguntas de negocio al especialista apropiado. Puedes consultar ambos para solicitudes mixtas. Conserva los datos de turnos anteriores al delegar. No inventes respuestas, citas ni identificadores. Resume fielmente las respuestas de los especialistas.',
      delegates, async (name, args) => {
        const key = name.replace('delegar_', '');
        const specialist = specialists[key];
        if (!specialist) throw new Error('Delegación desconocida.');
        log('MAS', 'delegate', { agent: key, traceId });
        const declarations = tools.filter(t => specialist.tools.includes(t.name)).map(t => ({
          name: t.name, description: t.description, parametersJsonSchema: t.inputSchema,
        }));
        const answer = await modelLoop(ai, [{ role: 'user', parts: [{ text: args.consulta }] }],
          specialist.prompt, declarations, async (tool, parameters) => {
            if (!specialist.tools.includes(tool)) throw new Error('Herramienta no permitida.');
            return invoke(tool, parameters);
          });
        return { respuesta: answer };
      });
    // Solo conservar turnos completos; no truncar pares functionCall/functionResponse.
    history.push({ role: 'user', parts: [{ text: message }] }, { role: 'model', parts: [{ text: respuesta }] });
    if (history.length > 40) history.splice(0, history.length - 40);
    return { respuesta, herramientas };
  });
}
