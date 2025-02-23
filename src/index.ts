import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import {
  createAckEvent,
  createDoneEvent,
  createErrorsEvent,
  createTextEvent,
  verifyAndParseRequest,
} from "@copilot-extensions/preview-sdk";
import { getUserMessageWithContext } from "./utils.ts";
import { config } from "./config.ts";

const app = new Hono();

console.log(
  "Using Ollama API with the following URL and model:",
  config.ollama
);

async function* getOllamaResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body available");
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = new TextDecoder().decode(value);
    const lines = chunk.split("\n").filter(Boolean);

    try {
      for (const line of lines) {
        const parsed = JSON.parse(line);

        if (parsed.response) {
          yield parsed.response;
        }
      }
    } catch (e) {
      throw new Error("Error parsing Ollama response:", { cause: e });
    }
  }
}

app.get("/", (c) => {
  return c.text("Welcome to the Ollama-powered Copilot Extension! 👋");
});

app.post("/", async (c) => {
  const tokenForUser = c.req.header("X-GitHub-Token") ?? "";
  const body = await c.req.text();
  const signature = c.req.header("github-public-key-signature") ?? "";
  const keyID = c.req.header("github-public-key-identifier") ?? "";

  const { isValidRequest, payload } = await verifyAndParseRequest(
    body,
    signature,
    keyID,
    {
      token: tokenForUser,
    }
  );

  if (!isValidRequest) {
    return c.text(
      createErrorsEvent([
        {
          type: "agent",
          message: "Failed to verify the request.",
          code: "INVALID_REQUEST",
          identifier: "invalid_request",
        },
      ])
    );
  }

  if (!tokenForUser) {
    return c.text(
      createErrorsEvent([
        {
          type: "agent",
          message: "No GitHub token provided in the request headers.",
          code: "MISSING_GITHUB_TOKEN",
          identifier: "missing_github_token",
        },
      ])
    );
  }

  c.header("Content-Type", "text/html");
  c.header("X-Content-Type-Options", "nosniff");

  return stream(c, async (stream) => {
    try {
      stream.write(createAckEvent());

      // TODO: detect file selection in question and use it as context instead of the whole file
      const userPrompt = getUserMessageWithContext({ payload, type: "file" });

      const ollamaResponse = await fetch(
        `${config.ollama.baseUrl}/api/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.ollama.model,
            prompt: userPrompt,
            stream: true,
          }),
        }
      );

      if (!ollamaResponse.ok) {
        stream.write(
          createErrorsEvent([
            {
              type: "agent",
              message: `Ollama request failed: ${ollamaResponse.statusText}`,
              code: "OLLAMA_REQUEST_FAILED",
              identifier: "ollama_request_failed",
            },
          ])
        );
      }

      for await (const chunk of getOllamaResponse(ollamaResponse)) {
        stream.write(createTextEvent(chunk));
      }

      stream.write(createDoneEvent());
    } catch (error) {
      console.error("Error:", error);
      stream.write(
        createErrorsEvent([
          {
            type: "agent",
            message: error instanceof Error ? error.message : "Unknown error",
            code: "PROCESSING_ERROR",
            identifier: "processing_error",
          },
        ])
      );
    }
  });
});

console.log(`Server is running on port ${config.server.port}`);

serve({
  fetch: app.fetch,
  port: Number(config.server.port),
});
