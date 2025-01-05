export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_API_BASE_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "codellama",
  },
  server: {
    port: Number(process.env.PORT ?? 3000),
  },
};
