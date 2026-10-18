import { connectA2A, send } from "./src/a2a-client.js";

export default class AgenteProvider {
  constructor(options = {}) {
    this.providerId = options.id || "agente-parachute";
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    try {
      const { respuesta, task } = await send(await connectA2A(), prompt);
      return { output: respuesta, metadata: task.artifacts?.[0]?.metadata || {} };
    } catch (error) {
      return { error: error.message };
    }
  }
}
