import { CopilotRequestPayload } from "@copilot-extensions/preview-sdk";

type FileContext = "file" | "selection";

declare module "@copilot-extensions/preview-sdk" {
  interface CopilotReferenceData {
    language: string;
    content: string;
  }
}

const FILES_PREAMBLE = `FILES ARE REFERENCED BELOW. YOU MUST PROVIDE MARKDOWN CODE SNIPPETS FOR EACH FILE WITH IMPROVEMENTS TO THEM ALL GROUPED TOGETHER. PREFIX MARKDOWN CODEBLOCKS WITH THEIR LANGUAGE. FOR EXAMPLE, \`\`\`typescript\nconsole.log("Hello, world!");\n\`\`\` FOR TYPESCRIPT. PROVIDE AN EXPLANATION OF THE CHANGES IN YOUR RESPONSE. KEEP EXPLANATIONS BRIEF.`;

/**
 * Extracts user message and relevant context from a Copilot payload
 * @param params
 * @param params.payload - The Copilot payload containing messages and references
 * @param params.type - Type of references to extract ('file' | 'selection'), defaults to 'file'
 * @returns Object containing user message and markdown formatted context
 */
export function getUserMessageWithContext({
  payload,
  type,
}: {
  payload: CopilotRequestPayload;
  type: FileContext;
}): string {
  const [firstMessage] = payload.messages;
  const relevantReferences = firstMessage?.copilot_references?.filter(
    (ref) => ref.type === `client.${type}`
  );

  if (!relevantReferences || relevantReferences.length === 0) {
    return firstMessage.content;
  }

  const contextMarkdown = relevantReferences
    .map((ref) => {
      return `File: ${ref.id}\n${ref.data.language}\`\`\`\n${ref.data.content}\n\`\`\``;
    })
    .join("\n\n");

  return `${firstMessage.content}\n\n${FILES_PREAMBLE}\n\n${contextMarkdown}`;
}
