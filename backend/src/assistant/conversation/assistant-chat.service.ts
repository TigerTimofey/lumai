import { randomUUID } from "crypto";
import { badRequest } from "../../utils/api-error.js";
import {
  getConversationState,
  saveConversationState
} from "../context/conversation-store.js";
import type { AssistantMessage, AssistantTrace } from "../types.js";
import type { VisualizationPayload } from "../visualizations/chart-builder.js";
import { buildSystemPrompt } from "../prompt/system-prompt.js";
import { FEW_SHOT_MESSAGES } from "../prompt/examples.js";
import {
  executeAssistantFunction,
  getAssistantFunctionDefinitions
} from "../functions/index.js";
import { runChatCompletion, type ChatMessage } from "./model.js";

const MAX_CONTEXT_MESSAGES = 12;
const SUMMARY_THRESHOLD = 14;

const toChatMessage = (message: AssistantMessage): ChatMessage => ({
  role: message.role,
  content: message.content
});

const sanitize = (value: string) => value.replace(/\s+/g, " ").trim();

const summarizeConversation = async (
  messages: AssistantMessage[],
  previousSummary: string | null
) => {
  const history = messages.slice(-10).map(toChatMessage);
  const summaryContent = previousSummary ? `Existing summary:\n${previousSummary}` : null;
  const prompt: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a summarization assistant. Condense the following conversation into at most three bullet points focusing on metrics, goals, and nutrition context. Keep numeric units."
    },
    ...(summaryContent
      ? [
          {
            role: "system" as const,
            content: summaryContent
          }
        ]
      : []),
    ...history
  ];
  const result = await runChatCompletion({
    messages: prompt,
    temperature: 0.2,
    topP: 0.7,
    maxTokens: 220,
    retryCount: 0
  });
  return result.message.content?.trim() || previousSummary;
};

const serializeMessages = (messages: AssistantMessage[]) =>
  messages.map((entry) => ({
    id: entry.id,
    role: entry.role,
    content: entry.content,
    createdAt: entry.createdAt.toISOString(),
    metadata: entry.metadata
  }));

export const getAssistantConversationSnapshot = async (userId: string) => {
  const state = await getConversationState(userId);
  return {
    summary: state.summary,
    messages: serializeMessages(state.messages)
  };
};

const summarizeFunctionResult = (result: unknown) => {
  try {
    if (result == null) return "Empty result";
    if (typeof result === "string") {
      return result.slice(0, 160);
    }
    const serialized = JSON.stringify(result);
    return serialized.length > 200 ? `${serialized.slice(0, 197)}...` : serialized;
  } catch {
    return "Result could not be serialized";
  }
};

interface RunAssistantChatOptions {
  userId: string;
  userName?: string | null;
  message: string;
}

export const runAssistantChat = async ({
  userId,
  userName,
  message
}: RunAssistantChatOptions) => {
  const trimmed = sanitize(message ?? "");
  if (!trimmed) {
    throw badRequest("Message cannot be empty.");
  }

  const state = await getConversationState(userId);
  const userMessage: AssistantMessage = {
    id: randomUUID(),
    role: "user",
    content: trimmed,
    createdAt: new Date()
  };

  const contextMessages = state.messages.slice(-MAX_CONTEXT_MESSAGES);
  const requestMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ userName }) },
    ...(state.summary
      ? [
          {
            role: "system" as const,
            content: `Conversation summary:\n${state.summary}`
          }
        ]
      : []),
    ...FEW_SHOT_MESSAGES,
    ...contextMessages.map(toChatMessage),
    { role: "user", content: userMessage.content }
  ];

  const trace: AssistantTrace = {
    request: trimmed,
    userDisplayName: userName ?? null,
    functionCalls: [],
    responsePlan: undefined
  };
  let pendingVisualizations: VisualizationPayload[] = [];

  const tracedExecutor = async (
    name: string,
    args: Record<string, unknown>,
    context?: Parameters<typeof executeAssistantFunction>[2]
  ) => {
    const entryIndex = trace.functionCalls.push({
      name,
      arguments: args,
      status: "pending"
    }) - 1;
    try {
      const result = await executeAssistantFunction(name, args, context);
      const visualization = extractVisualizationPayload(result);
      trace.functionCalls[entryIndex] = {
        ...trace.functionCalls[entryIndex],
        status: "ok",
        resultPreview: summarizeFunctionResult(result),
        ...(visualization ? { visualization } : {})
      };
      if (visualization) {
        pendingVisualizations = [...pendingVisualizations, visualization];
      }
      return result;
    } catch (error) {
      trace.functionCalls[entryIndex] = {
        ...trace.functionCalls[entryIndex],
        status: "error",
        resultPreview: error instanceof Error ? error.message : "Unknown error"
      };
      throw error;
    }
  };

  const response = await runChatCompletion({
    messages: requestMessages,
    temperature: 0.3,
    topP: 0.85,
    maxTokens: 650,
    retryCount: 1,
    functions: getAssistantFunctionDefinitions(),
    executeFunction: tracedExecutor,
    functionContext: { userId, userName }
  });

  const assistantContent = ensurePrefixedResponse(sanitizeAssistantContent(response.message.content));
  trace.responsePlan = assistantContent;
  const assistantMessage: AssistantMessage = {
    id: randomUUID(),
    role: "assistant",
    content: assistantContent,
    createdAt: new Date()
  };
  if (pendingVisualizations.length) {
    assistantMessage.metadata = {
      ...(assistantMessage.metadata ?? {}),
      visualizations: pendingVisualizations
    };
    pendingVisualizations = [];
  }

  let updatedMessages = [...contextMessages, userMessage, assistantMessage];
  let summary = state.summary;

  if (updatedMessages.length >= SUMMARY_THRESHOLD) {
    summary = await summarizeConversation(updatedMessages, summary);
    updatedMessages = updatedMessages.slice(-8);
  }

  await saveConversationState({
    userId,
    summary,
    topics: state.topics,
    messages: updatedMessages,
    updatedAt: new Date()
  });

  return {
    summary,
    message: {
      id: assistantMessage.id,
      role: assistantMessage.role,
      content: assistantMessage.content,
      createdAt: assistantMessage.createdAt.toISOString()
    },
    messages: serializeMessages(updatedMessages),
    trace
  };
};

const sanitizeAssistantContent = (value: string | undefined) => {
  if (!value) {
    return "I could not generate a response.";
  }
  let cleaned = value.replace(/<\|[^>]+>/g, "");
  cleaned = cleaned.replace(/commentaryassistant/gi, "assistant");
  cleaned = stripFunctionCallArtifacts(cleaned);
  cleaned = cleaned.replace(/\{[^}]*"chart_url"[^}]*\}/gi, "");
  cleaned = cleaned.replace(/!\[[^\]]*]\([^)]*\)/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned || "I could not generate a response.";
};

const ensurePrefixedResponse = (value: string) => {
  const prefix = `Lumai ✦︎ `;
  if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
    const [firstLine, ...rest] = value.split("\n");
    const remainder = rest.join("\n").trim();
    return remainder.length ? `${firstLine}\n${remainder}` : firstLine;
  }
  return `${prefix}\n${value}`;
};

const extractVisualizationPayload = (payload: unknown): VisualizationPayload | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const visualization = (payload as { visualization?: VisualizationPayload }).visualization;
  if (!visualization || typeof visualization !== "object") {
    return null;
  }
  if (typeof (visualization as VisualizationPayload).type === "string") {
    return visualization as VisualizationPayload;
  }
  return null;
};

const stripFunctionCallArtifacts = (input: string) => {
  let result = input;
  const pattern = /assistantcommentary to=functions\.[\w-]+commentary\s+json/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(result))) {
    const start = match.index;
    const jsonStart = result.indexOf("{", pattern.lastIndex);
    if (jsonStart === -1) {
      break;
    }
    const jsonEnd = findMatchingBrace(result, jsonStart);
    if (jsonEnd === -1) {
      break;
    }
    result = `${result.slice(0, start)} ${result.slice(jsonEnd + 1)}`;
    pattern.lastIndex = 0;
  }

  return result;
};

const findMatchingBrace = (text: string, startIndex: number) => {
  let depth = 0;
  for (let index = startIndex; index < text.length; index++) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
};
