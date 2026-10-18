import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";

dotenv.config();

const MODEL = process.env.AGENT_MODEL || "gemini-3.5-flash-lite";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const citas = {};

const faqs = [
  {
    pregunta: "¿Cuál es el horario de atención?",
    respuesta: "Atendemos de lunes a viernes de 9:00 a 18:00.",
    claves: "horario horarios abren cierran atienden atencion",
  },
  {
    pregunta: "¿Cuál es el costo de la consulta?",
    respuesta: "El costo de la consulta es de Q250 por sesión.",
    claves: "costo cuesta precio valor tarifa",
  },
  {
    pregunta: "¿Ofrecen consultas virtuales?",
    respuesta: "Sí, ofrecemos consultas presenciales y virtuales por videollamada.",
    claves: "virtual virtuales videollamada linea remota remoto zoom meet distancia",
  },
  {
    pregunta: "¿Cuál es la política de cancelación?",
    respuesta:
      "Las citas se pueden cancelar sin costo con al menos 24 horas de anticipación. Cancelaciones con menos tiempo tienen un cargo de Q100.",
    claves: "cancelar cancelo cancelacion cancelaciones anular reprogramar",
  },
  {
    pregunta: "¿Dónde están ubicados?",
    respuesta: "Estamos en 5a. Avenida 10-50, Zona 10, Ciudad de Guatemala.",
    claves: "ubicados ubicacion direccion oficinas oficina quedan encuentran llegar",
  },
  {
    pregunta: "¿Qué formas de pago aceptan?",
    respuesta: "Aceptamos efectivo, tarjeta de crédito o débito y transferencia bancaria.",
    claves: "pago pagar pagos tarjeta efectivo transferencia",
  },
];

const STOPWORDS = new Set([
  "cual", "como", "donde", "cuando", "que", "para", "por", "con", "una", "las", "los",
  "del", "ustedes", "tienen", "hay", "son", "esta", "este", "sus", "nos",
]);

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !STOPWORDS.has(p));
}

function buscarFaq({ pregunta }) {
  const palabras = new Set(normalizar(pregunta));
  let mejor = null;
  let mejorPuntaje = 0;
  for (const faq of faqs) {
    const texto = new Set(normalizar(`${faq.pregunta} ${faq.respuesta}`));
    const claves = new Set(normalizar(faq.claves));
    let puntaje = 0;
    for (const p of palabras) {
      if (claves.has(p)) puntaje += 2;
      else if (texto.has(p)) puntaje += 1;
    }
    if (puntaje > mejorPuntaje) {
      mejor = faq;
      mejorPuntaje = puntaje;
    }
  }
  if (!mejor) {
    return { encontrada: false, mensaje: "La pregunta no está en la base de preguntas frecuentes." };
  }
  return { encontrada: true, pregunta: mejor.pregunta, respuesta: mejor.respuesta };
}

function agendarCita({ nombre, fecha, hora, correo }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { exito: false, error: "La fecha debe tener formato YYYY-MM-DD." };
  }
  if (!/^\d{2}:\d{2}$/.test(hora)) {
    return { exito: false, error: "La hora debe tener formato HH:MM." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { exito: false, error: "El correo electrónico no es válido." };
  }
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  if (dia === 0 || dia === 6) {
    return { exito: false, error: "Solo se agendan citas de lunes a viernes." };
  }
  if (hora < "09:00" || hora > "17:00") {
    return { exito: false, error: "Solo se agendan citas entre 09:00 y 17:00." };
  }
  const ocupada = Object.values(citas).some((c) => c.fecha === fecha && c.hora === hora);
  if (ocupada) {
    return { exito: false, error: "Ese horario ya está ocupado." };
  }
  const id = `APT_${String(Object.keys(citas).length + 1).padStart(4, "0")}`;
  citas[id] = { nombre, fecha, hora, correo };
  return { exito: true, id_cita: id, ...citas[id] };
}

function consultarCita({ id_cita }) {
  const cita = citas[id_cita];
  return cita ? { exito: true, id_cita, ...cita } : { exito: false, error: `No existe la cita ${id_cita}.` };
}

const implementaciones = {
  buscar_faq: buscarFaq,
  agendar_cita: agendarCita,
  consultar_cita: consultarCita,
};

const tools = [
  {
    name: "buscar_faq",
    description:
      "Busca la respuesta oficial a una pregunta frecuente (horario, costo, consultas virtuales, cancelación, ubicación, formas de pago).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        pregunta: { type: "string", description: "Pregunta del cliente" },
      },
      required: ["pregunta"],
    },
  },
  {
    name: "agendar_cita",
    description: "Agenda una cita. Solo se llama cuando se tienen nombre, fecha, hora y correo.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo del cliente" },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
        hora: { type: "string", description: "Hora en formato HH:MM de 24 horas" },
        correo: { type: "string", description: "Correo electrónico del cliente" },
      },
      required: ["nombre", "fecha", "hora", "correo"],
    },
  },
  {
    name: "consultar_cita",
    description: "Consulta los datos de una cita existente por su identificador.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        id_cita: { type: "string", description: "Identificador de la cita, por ejemplo APT_0001" },
      },
      required: ["id_cita"],
    },
  },
];

const SYSTEM_PROMPT = `Eres el asistente virtual de Parachute S.A. Respondes siempre en español.
Tienes dos funciones: agendar citas y responder preguntas frecuentes.

Preguntas frecuentes:
- Usa siempre la herramienta buscar_faq antes de responder. Responde solo con la información que devuelve.
- Si la herramienta no encuentra la respuesta, di exactamente: "No cuento con esa información." y ofrece ayuda para agendar una cita.

Citas:
- Para agendar necesitas nombre, fecha, hora y correo. Si falta alguno, pídelo y no llames agendar_cita.
- Convierte fechas a YYYY-MM-DD y horas a HH:MM (24 horas). Si el cliente no indica el año, usa 2026.
- Al confirmar una cita, incluye el identificador (por ejemplo APT_0001), la fecha y la hora.
- Si la herramienta devuelve un error, explica el motivo al cliente.`;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// El nivel gratuito de Gemini limita solicitudes por minuto; se reintenta ante 429/503.
async function generar(contents) {
  for (let intento = 1; ; intento++) {
    try {
      return await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: tools }],
        },
      });
    } catch (error) {
      if (intento >= 5 || ![429, 503].includes(error.status)) throw error;
      await esperar(15000 * intento);
    }
  }
}

export async function runAgent(mensaje) {
  const contents = [{ role: "user", parts: [{ text: mensaje }] }];
  const herramientas = [];

  for (let turno = 0; turno < 6; turno++) {
    const response = await generar(contents);
    const llamadas = response.functionCalls || [];

    if (llamadas.length === 0) {
      return { respuesta: response.text || "", herramientas };
    }

    contents.push(response.candidates[0].content);
    const resultados = [];
    for (const llamada of llamadas) {
      const fn = implementaciones[llamada.name];
      const argumentos = llamada.args || {};
      const resultado = fn ? fn(argumentos) : { error: `Herramienta desconocida: ${llamada.name}` };
      herramientas.push({ nombre: llamada.name, argumentos, resultado });
      resultados.push({
        functionResponse: { id: llamada.id, name: llamada.name, response: resultado },
      });
    }
    contents.push({ role: "user", parts: resultados });
  }

  return { respuesta: "No se pudo completar la solicitud.", herramientas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mensaje = process.argv.slice(2).join(" ") || "¿Cuál es el horario de atención?";
  const { respuesta, herramientas } = await runAgent(mensaje);
  console.log(respuesta);
  console.log("\nHerramientas:", JSON.stringify(herramientas, null, 2));
}
