# Guion de video de entrega

Graba la pantalla con tres terminales visibles: MCP, A2A y cliente. Usa datos ficticios y oculta `.env`. Puedes usar la herramienta de grabación que ya tengas instalada. Guarda el video como MP4 y entrégalo junto al enlace del repositorio.

## Evidencia incluida

`evidencia/demo-protocolos.mp4` reproduce stdout/stderr reales capturados de los dos servidores y de la CLI, en tres paneles. Muestra FAQ, reserva, consulta y horario ocupado. Se amplían las pausas para leer los logs. Está rotulado como modo demo sin Gemini: no es una grabación manual del escritorio ni demuestra llamadas al modelo.

También se incluyen los eventos originales (`demo-events.json`) y una captura de terminal en formato asciicast (`demo.cast`). Para regenerarlos ejecuta `npm run record:demo`; usa una base temporal y puertos 14000/14001. Para producir el MP4 instala Python con Pillow (`python -m pip install Pillow`) y usa:

```powershell
$taskFfmpeg = node -p "require('@ffmpeg-installer/ffmpeg').path"
python scripts/render-demo.py $taskFfmpeg
```

En sistemas distintos de Windows pasa como tercer argumento una ruta a una fuente monoespaciada TrueType. Para la entrega completa se recomienda grabar además el flujo Gemini de abajo con tu clave configurada.

## Demostración recomendada (3–5 minutos)

1. Presenta CC3116, hoja 7, Parachute S.A. y el diagrama del README.
2. En la primera terminal ejecuta `npm run mcp`. Muestra `listening`, el puerto 3001 y `streamable-http`.
3. En la segunda ejecuta `npm run a2a` con Gemini configurado. Muestra `listening` y `mode: gemini`.
4. Muestra la Agent Card en `http://127.0.0.1:3000/.well-known/agent-card.json`: un agente y tres skills.
5. En la tercera terminal ejecuta `npm run client` y pregunta «¿Cuánto cuesta la consulta?». Muestra respuesta Q250, log de delegación al especialista FAQ y logs `buscar_faq` en MCP.
6. Solicita agendar sin datos completos. Completa con «Ana Prueba, el 2 de noviembre de 2026 a las 10:00, ana@example.com». Muestra delegación a citas, `agendar_cita`, identificador devuelto y tarea completada.
7. Consulta ese identificador. Muestra `consultar_cita` y la reserva.
8. Intenta reservar de nuevo el mismo horario. Muestra el error de negocio y que no se confirma otra cita.
9. Envía una consulta mixta de FAQ y reserva para mostrar ambas delegaciones.
10. Cierra mostrando `npm test` y explica: terminal → A2A → multiagente → MCP → herramientas.

Si no cuentas con clave, usa el modo `demo` y los comandos explícitos del README. Declara en el video que esta variante demuestra los transportes y herramientas, y que Gemini debe probarse por separado para demostrar el sistema multiagente normal.

Para conservar logs en PowerShell puedes ejecutar `npm run mcp | Tee-Object mcp.log` y `npm run a2a | Tee-Object a2a.log`.

## Antes de entregar

- El enlace del repositorio debe ser accesible para el docente.
- El video debe mostrar los dos servidores, sus logs por solicitud y la interacción del cliente A2A.
- Prueba los mensajes antes de grabar: las reservas persisten, por lo que un horario usado puede estar ocupado.
- No presentes los reportes de la hoja 6 como resultados de la hoja 7.
