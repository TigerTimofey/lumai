import type { Timestamp } from "firebase-admin/firestore";

export type AssistantMessageRole = "user" | "assistant";

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: Date;
  metadata?: {
    visualizationType?: string;
    topics?: string[];
  };
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
}

export interface AssistantTrace {
  request: string;
  userDisplayName?: string | null;
  responsePlan?: string;
  functionCalls: AssistantFunctionCallTrace[];
}
