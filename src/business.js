// Adaptado de Diana-Sosa18/hoja6-ia, agent.js (ver docs/ORIGEN.md).
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const archivo = resolve(process.env.APPOINTMENTS_FILE || './data/citas.json');
const citas = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : {};
function persistir() {
  mkdirSync(dirname(archivo), { recursive: true });
  writeFileSync(`${archivo}.tmp`, JSON.stringify(citas, null, 2));
  renameSync(`${archivo}.tmp`, archivo);
}
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

export function buscarFaq({ pregunta }) {
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

export function agendarCita({ nombre, fecha, hora, correo }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { exito: false, error: "La fecha debe tener formato YYYY-MM-DD." };
  }
  if (!/^\d{2}:\d{2}$/.test(hora)) {
    return { exito: false, error: "La hora debe tener formato HH:MM." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { exito: false, error: "El correo electrónico no es válido." };
  }
  const parsed = new Date(`${fecha}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha) {
    return { exito: false, error: "La fecha no existe en el calendario." };
  }
  if (!nombre.trim()) return { exito: false, error: "El nombre es obligatorio." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return { exito: false, error: "La hora no es válida." };
  }
  const dia = parsed.getUTCDay();
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
  persistir();
  return { exito: true, id_cita: id, ...citas[id] };
}

export function consultarCita({ id_cita }) {
  const cita = citas[id_cita];
  return cita ? { exito: true, id_cita, ...cita } : { exito: false, error: `No existe la cita ${id_cita}.` };
}
