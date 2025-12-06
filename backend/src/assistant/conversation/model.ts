import axios from "axios";
import env from "../../config/env.js";
import { serviceUnavailable } from "../../utils/api-error.js";
import type { AssistantFunctionContext } from "../types.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface AssistantFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface RunChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  retryCount?: number;
  functions?: AssistantFunctionDefinition[];
  executeFunction?: (
    name: string,
    args: Record<string, unknown>,
    context?: AssistantFunctionContext
  ) => Promise<unknown>;
  functionContext?: AssistantFunctionContext;
  maxToolDepth?: number;
}

export interface ChatCompletionResult {
  message: ChatMessage;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const extractToolCalls = (message: Record<string, unknown> | undefined) => {
  if (!message) return [];
  const hfCalls = normalizeHfFunctionCalls(message);
  if (hfCalls.length) {
    return hfCalls;
  }
  if (Array.isArray(message.tool_calls)) {
    return message.tool_calls as ChatMessage["tool_calls"];
  }
  if (message.function_call) {
    return [
      {
        id: (message as { id?: string }).id,
        function: message.function_call as { name: string; arguments: string }
      }
    ];
  }
  return [];
};

const parseArguments = (payload: string | null | undefined) => {
  if (!payload) return {};
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const toChatRole = (value: unknown): ChatRole => {
  if (value === "system" || value === "user" || value === "assistant" || value === "tool") {
    return value;
  }
  return "assistant";
};

const HF_FUNCTION_PATTERN =
  /<\|channel\|>commentary to=functions\.([^\s<]+)\s+<\|constrain\|>json<\|message\|>(\{[\s\S]*?\})(?:<\|call\|>assistant)?/i;

const HF_FUNCTION_ALIASES: Record<
  string,
  {
    name: string;
    transform?: (args: Record<string, unknown>) => Record<string, unknown>;
  }
> = {
  get_health_metrics: { name: "get_health_metrics" },
  get_weight: {
    name: "get_health_metrics",
    transform: () => ({ metric_type: "weight", time_period: "current" })
  },
  get_height: {
    name: "get_health_metrics",
    transform: () => ({ metric_type: "height", time_period: "current" })
  },
  get_bmi: {
    name: "get_health_metrics",
    transform: () => ({ metric_type: "bmi", time_period: "current" })
  },
  get_wellness_score: {
    name: "get_health_metrics",
    transform: () => ({ metric_type: "wellness_score", time_period: "30d" })
  },
  get_goal_progress: { name: "get_goal_progress" },
  get_meal_plan: { name: "get_meal_plan" },
  get_meal_plan_today: {
    name: "get_meal_plan",
    transform: (args) => ({
      ...args,
      day:
        typeof args.day === "string" && args.day.trim()
          ? args.day
          : new Date().toISOString().slice(0, 10)
    })
  },
  get_nutrition_snapshot: { name: "get_nutrition_snapshot" },
  get_nutrition_summary: { name: "get_nutrition_snapshot" },
  get_weekly_nutrition: {
    name: "get_nutrition_snapshot",
    transform: () => ({ time_period: "7d" })
  },
  get_recipe_details: { name: "get_recipe_details" },
  get_recipe: { name: "get_recipe_details" },
  get_visualization: { name: "get_visualization" },
  get_chart: { name: "get_visualization" }
};

const normalizeHfFunctionCalls = (message: Record<string, unknown>) => {
  if (typeof message.content !== "string") {
    return [];
  }

  const hfPattern = new RegExp(HF_FUNCTION_PATTERN, "gi");
  const matches = [...message.content.matchAll(hfPattern)];
  if (!matches.length) {
    return [];
  }

  let remaining = message.content;
  const toolCalls = matches.map((match) => {
    const [fullMatch, rawName, rawArgs] = match;
    remaining = remaining.replace(fullMatch, "").trim();
    const mapped = mapHfFunction(rawName, rawArgs);
    return {
      id: `hf-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      function: {
        name: mapped.name,
        arguments: mapped.arguments
      }
    };
  });

  message.content = remaining;
  return toolCalls;
};

const mapHfFunction = (rawName: string, argsJson: string) => {
  const normalized = rawName.replace(/^functions\./i, "").trim();
  const lowered = normalized.toLowerCase();
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    parsedArgs = {};
  }
  const alias =
    HF_FUNCTION_ALIASES[lowered] ?? HF_FUNCTION_ALIASES[normalized] ?? HF_FUNCTION_ALIASES[rawName];
  if (alias) {
    const transformed = alias.transform ? alias.transform(parsedArgs) : parsedArgs;
    return {
      name: alias.name,
      arguments: JSON.stringify(transformed ?? {})
    };
  }
  return {
    name: normalized,
    arguments: argsJson
  };
};

export const runChatCompletion = async ({
  messages,
  temperature = 0.2,
  topP = 0.9,
  maxTokens = 750,
  retryCount = 1,
  functions,
  executeFunction,
  functionContext,
  maxToolDepth = 5
}: RunChatCompletionOptions): Promise<ChatCompletionResult> => {
  if (!env.HF_API_URL || !env.HF_API_KEY) {
    throw serviceUnavailable("AI provider not configured");
  }

  let conversation = [...messages];
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      for (let depth = 0; depth < maxToolDepth; depth++) {
        const { data } = await axios.post(
          env.HF_API_URL,
          {
            model: env.HF_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct",
            temperature,
            top_p: topP,
            max_tokens: maxTokens,
            messages: conversation,
            ...(functions?.length ? { functions } : {})
          },
          {
            headers: {
              Authorization: `Bearer ${env.HF_API_KEY}`,
              "Content-Type": "application/json"
            },
            timeout: 35_000
          }
        );
        const assistantResponse = data?.choices?.[0]?.message ?? {};
        const toolCalls = extractToolCalls(assistantResponse);
        const normalized: ChatMessage = {
          role: toChatRole(assistantResponse.role),
          content: typeof assistantResponse.content === "string" ? assistantResponse.content : String(assistantResponse.content ?? ""),
          tool_calls: toolCalls?.length ? toolCalls : undefined
        };

        if (!toolCalls?.length || !executeFunction) {
          return { message: normalized, usage: data?.usage };
        }

        conversation = [...conversation, normalized];
        for (const call of toolCalls) {
          const args = parseArguments(call?.function?.arguments);
          let result: unknown;
          try {
            result = await executeFunction(call?.function?.name ?? "", args, functionContext);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Failed to execute function call";
            result = {
              status: "error",
              message
            };
          }
          conversation = [
            ...conversation,
            {
              role: "tool",
              name: call?.function?.name ?? "tool",
              tool_call_id: call?.id,
              content: JSON.stringify(result ?? {})
            }
          ];
        }
      }
      throw new Error("Assistant exceeded maximum tool depth");
    } catch (error) {
      if (attempt === retryCount) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw new Error("Assistant model invocation failed");
};
