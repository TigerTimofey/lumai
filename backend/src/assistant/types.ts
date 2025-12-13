import type { Timestamp } from "firebase-admin/firestore";
import type { VisualizationPayload } from "./visualizations/chart-builder.js";

export type AssistantMessageRole = "user" | "assistant";

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: Date;
  metadata?: AssistantMessageMetadata;
}

export interface AssistantMessageMetadata {
  visualizationType?: string;
  topics?: string[];
  visualizations?: VisualizationPayload[];
}

export interface AssistantConversationState {
  userId: string;
  summary: string | null;
  topics: string[];
  messages: AssistantMessage[];
  updatedAt: Date;
}

export interface AssistantConversationDocument {
  summary?: string | null;
  topics?: string[];
  messages?: Array<{
    id: string;
    role: AssistantMessageRole;
    content: string;
    createdAt: Timestamp;
    metadata?: AssistantMessage["metadata"];
  }>;
  updatedAt?: Timestamp;
}

export interface AssistantFunctionContext {
  userId: string;
  userName?: string | null;
}

export interface AssistantFunctionCallTrace {
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "ok" | "error";
  resultPreview?: string;
  visualization?: VisualizationPayload;
}

export interface AssistantTrace {
  request: string;
  userDisplayName?: string | null;
  responsePlan?: string;
  functionCalls: AssistantFunctionCallTrace[];
}
