import { randomUUID } from "crypto";
import { badRequest } from "../../utils/api-error.js";
import {
  getConversationState,
  saveConversationState
} from "../context/conversation-store.js";
import type { AssistantMessage, AssistantTrace } from "../types.js";
import type { VisualizationPayload, VisualizationType } from "../visualizations/chart-builder.js";
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

type HealthMetricRequest = "weight" | "height" | "bmi" | "wellness_score";
type MetricTimePeriod = "current" | "7d" | "30d" | "90d";
type ResponseMode = "concise" | "detailed";

const detectMetricRequests = (message: string): HealthMetricRequest[] => {
  const normalized = message.toLowerCase();
  const metrics: HealthMetricRequest[] = [];
  if (/\bweight\b/.test(normalized)) {
    metrics.push("weight");
  }
  if (/\bheight\b/.test(normalized)) {
    metrics.push("height");
  }
  if (/\bbmi\b/.test(normalized) || /body mass index/.test(normalized)) {
    metrics.push("bmi");
  }
  if (/\bwellness\b/.test(normalized)) {
    metrics.push("wellness_score");
  }
  return [...new Set(metrics)];
};

const shouldFetchGoalProgress = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    /\bgoal(s)?\b/.test(normalized) ||
    /\bmilestone(s)?\b/.test(normalized) ||
    /\bon track\b/.test(normalized) ||
    /\btarget\b/.test(normalized)
  );
};

const resolveTimePeriod = (message: string, fallback: MetricTimePeriod): MetricTimePeriod => {
  const normalized = message.toLowerCase();
  if (/(last|past)\s+(7|seven)\s+days/.test(normalized) || /\b(last|past)\s+week\b/.test(normalized) || /\bthis week\b/.test(normalized)) {
    return "7d";
  }
  if (/(last|past)\s+30\s+days/.test(normalized) || /\b(last|past)\s+month\b/.test(normalized) || /\bthis month\b/.test(normalized)) {
    return "30d";
  }
  if (/(last|past)\s+90\s+days/.test(normalized) || /\b(last|past)\s+(quarter|three months)\b/.test(normalized)) {
    return "90d";
  }
  return fallback;
};

const detectVisualizationRequest = (message: string): { type: VisualizationType; timePeriod?: MetricTimePeriod } | null => {
  const normalized = message.toLowerCase();
  if (!/(chart|graph|plot|visual)/.test(normalized)) {
    return null;
  }

  let type: VisualizationType = "weight_trend";
  if (normalized.includes("protein")) {
    type = "protein_vs_target";
  } else if (normalized.includes("macro")) {
    type = "macro_breakdown";
  } else if (normalized.includes("sleep")) {
    type = "sleep_vs_target";
  } else if (normalized.includes("weight")) {
    type = "weight_trend";
  }

  const period = resolveTimePeriod(message, "30d");
  return {
    type,
    timePeriod: period === "current" ? undefined : period
  };
};

const detectResponseMode = (message: string): ResponseMode | null => {
  const normalized = message.toLowerCase();
  if (/\b(concise|brief|short version|tl;dr|summary)\b/.test(normalized)) {
    return "concise";
  }
  if (/\b(detailed|in-depth|elaborate|explain more|long form)\b/.test(normalized)) {
    return "detailed";
  }
  return null;
};

const buildResponseModeInstruction = (mode: ResponseMode) => {
  if (mode === "concise") {
    return "The user requested a concise reply. Limit the response to the essential metrics with at most two short paragraphs or bullet lists, and avoid extended explanations.";
  }
  return "The user requested a detailed reply. Provide richer context, rationale, and next steps while still grounding every statement in the fetched data.";
};

const extractDebugMetadata = (functionName: string, payload: unknown) => {
  if (functionName !== "get_health_metrics" || !payload || typeof payload !== "object") {
    return null;
  }

  const gather = (entry: Record<string, unknown>) => {
    const debug: Record<string, number | null> = {};
    const metricType = typeof entry.metricType === "string" ? entry.metricType : "";
    if (metricType === "multiple" && Array.isArray(entry.metrics)) {
      entry.metrics.forEach((nested) => {
        if (nested && typeof nested === "object") {
          Object.assign(debug, gather(nested as Record<string, unknown>));
        }
      });
    }
    if (metricType === "overview" && entry.metrics && typeof entry.metrics === "object") {
      const overviewMetrics = entry.metrics as Record<string, unknown>;
      if (typeof overviewMetrics.weightKg === "number") {
        debug.weightKg = overviewMetrics.weightKg;
      }
      if (typeof overviewMetrics.heightCm === "number") {
        debug.heightCm = overviewMetrics.heightCm;
      }
    }
    if (metricType === "weight" && typeof entry.currentValue === "number") {
      debug.weightKg = entry.currentValue;
    }
    if (metricType === "bmi" && typeof entry.currentValue === "number") {
      debug.bmi = entry.currentValue;
    }
    if (typeof entry.heightCm === "number") {
      debug.heightCm = entry.heightCm;
    }
    return debug;
  };

  const aggregated = gather(payload as Record<string, unknown>);
  return Object.keys(aggregated).length ? aggregated : null;
};

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
  const responseMode = detectResponseMode(trimmed);
  const requestedMetrics = detectMetricRequests(trimmed);
  const wantsGoalProgress = shouldFetchGoalProgress(trimmed);
  const visualizationRequest = detectVisualizationRequest(trimmed);

  const contextMessages = state.messages.slice(-MAX_CONTEXT_MESSAGES);
  const requestMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ userName }) },
    ...(responseMode
      ? [
          {
            role: "system" as const,
            content: buildResponseModeInstruction(responseMode)
          }
        ]
      : []),
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

  const buildMetricCallArgs = () => {
    if (!requestedMetrics.length) {
      return [];
    }
    if (requestedMetrics.length > 1) {
      const metricsArray = [...new Set(requestedMetrics)];
      return [
        {
          metric_type: metricsArray[0] ?? "weight",
          metrics: metricsArray,
          time_period: resolveTimePeriod(
            trimmed,
            metricsArray.includes("wellness_score") ? "30d" : "current"
          )
        }
      ];
    }
    return requestedMetrics.map((metric) => ({
      metric_type: metric,
      time_period: resolveTimePeriod(trimmed, metric === "wellness_score" ? "30d" : "current")
    }));
  };

  const appendForcedToolCalls = async () => {
    const callArgsList = buildMetricCallArgs();
    if (!callArgsList.length) {
      return;
    }
    for (const args of callArgsList) {
      const callId = `prefetch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const traceIndex =
        trace.functionCalls.push({
          name: "get_health_metrics",
          arguments: args,
          status: "pending"
        }) - 1;
      try {
        const result = await executeAssistantFunction("get_health_metrics", args, { userId, userName });
        const visualization = extractVisualizationPayload(result);
        const debugInfo = extractDebugMetadata("get_health_metrics", result);
        trace.functionCalls[traceIndex] = {
          ...trace.functionCalls[traceIndex],
          status: "ok",
          resultPreview: summarizeFunctionResult(result),
          ...(visualization ? { visualization } : {}),
          ...(debugInfo ? { debug: debugInfo } : {})
        };
        if (visualization) {
          pendingVisualizations = [...pendingVisualizations, visualization];
        }
        requestMessages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: callId,
              function: {
                name: "get_health_metrics",
                arguments: JSON.stringify(args)
              }
            }
          ]
        });
        requestMessages.push({
          role: "tool",
          name: "get_health_metrics",
          tool_call_id: callId,
          content: JSON.stringify(result ?? {})
        });
      } catch (error) {
        trace.functionCalls[traceIndex] = {
          ...trace.functionCalls[traceIndex],
          status: "error",
          resultPreview: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }
  };
  await appendForcedToolCalls();

  const appendGoalProgressCall = async () => {
    if (!wantsGoalProgress) {
      return;
    }
    const args: Record<string, unknown> = {};
    const callId = `prefetch-goal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const traceIndex =
      trace.functionCalls.push({
        name: "get_goal_progress",
        arguments: args,
        status: "pending"
      }) - 1;
    try {
      const result = await executeAssistantFunction("get_goal_progress", args, { userId, userName });
      trace.functionCalls[traceIndex] = {
        ...trace.functionCalls[traceIndex],
        status: "ok",
        resultPreview: summarizeFunctionResult(result)
      };
      requestMessages.push({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: callId,
            function: {
              name: "get_goal_progress",
              arguments: JSON.stringify(args)
            }
          }
        ]
      });
      requestMessages.push({
        role: "tool",
        name: "get_goal_progress",
        tool_call_id: callId,
        content: JSON.stringify(result ?? {})
      });
    } catch (error) {
      trace.functionCalls[traceIndex] = {
        ...trace.functionCalls[traceIndex],
        status: "error",
        resultPreview: error instanceof Error ? error.message : "Unknown error"
      };
    }
  };
  await appendGoalProgressCall();

  const appendForcedVisualizationCall = async () => {
    if (!visualizationRequest) {
      return;
    }
    const args: Record<string, unknown> = {
      visualization_type: visualizationRequest.type
    };
    if (visualizationRequest.timePeriod) {
      args.time_period = visualizationRequest.timePeriod;
    }
    const callId = `prefetch-viz-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const entryIndex =
      trace.functionCalls.push({
        name: "get_visualization",
        arguments: args,
        status: "pending"
      }) - 1;
    try {
      const result = await executeAssistantFunction("get_visualization", args, { userId, userName });
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
      requestMessages.push({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: callId,
            function: {
              name: "get_visualization",
              arguments: JSON.stringify(args)
            }
          }
        ]
      });
      requestMessages.push({
        role: "tool",
        name: "get_visualization",
        tool_call_id: callId,
        content: JSON.stringify(result ?? {})
      });
    } catch (error) {
      trace.functionCalls[entryIndex] = {
        ...trace.functionCalls[entryIndex],
        status: "error",
        resultPreview: error instanceof Error ? error.message : "Unknown error"
      };
    }
  };
  await appendForcedVisualizationCall();

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
      const debugInfo = extractDebugMetadata(name, result);
      trace.functionCalls[entryIndex] = {
        ...trace.functionCalls[entryIndex],
        status: "ok",
        resultPreview: summarizeFunctionResult(result),
        ...(visualization ? { visualization } : {}),
        ...(debugInfo ? { debug: debugInfo } : {})
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
  result = result.replace(/^\s*"{[^}]+}"\s*/g, "");
  const marker = /assistantcommentary to=functions\.[^\s{]+/gi;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(result))) {
    const start = match.index;
    const jsonStart = result.indexOf("{", marker.lastIndex);
    if (jsonStart === -1) {
      break;
    }
    const jsonEnd = findMatchingBrace(result, jsonStart);
    if (jsonEnd === -1) {
      break;
    }
    result = `${result.slice(0, start)} ${result.slice(jsonEnd + 1)}`.trim();
    marker.lastIndex = 0;
  }
  result = result.replace(/analysiscommentary/gi, " ");
  result = result.replace(/commentaryjson/gi, " ");
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
