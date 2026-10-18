# Procedencia

- Repositorio base proporcionado: https://github.com/Diana-Sosa18/hoja6-ia.git
- Commit consultado: `bb693fabeb948d6b256a57a6b0e7e95baddfdae5`.
- Destino solicitado: https://github.com/anaxmarcela/ProtocolosAgenticos.git

`legacy/agent-hoja6.js` conserva el archivo original para comparar. No es el punto de entrada de la hoja 7. El paquete original declara licencia MIT en su `package.json`; se reconoce aquí la procedencia de su código, sin atribuir autoría nueva al trabajo original.

Se extrajeron las FAQ y operaciones de citas a `src/business.js`, usadas exclusivamente por el servidor MCP. Se añadieron validación de fechas reales, persistencia de citas, un cliente MCP, coordinador y especialistas Gemini, servidor A2A con Agent Card, cliente de terminal A2A y pruebas de integración. `provider.js` conserva la interfaz de promptfoo usando ahora el servidor A2A.

La hoja 6 contenía un único agente con tres herramientas. La separación en coordinador, agente FAQ y agente de citas se implementa en esta hoja para exponer el sistema completo mediante A2A.
