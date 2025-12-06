import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../../config/firebase.js";
import type {
  AssistantConversationDocument,
  AssistantConversationState,
  AssistantMessage
} from "../types.js";

const MAX_STORED_MESSAGES = 30;

const collectionRef = () => firestore().collection("assistant_conversations");

const deserializeMessages = (
  entries: AssistantConversationDocument["messages"]
): AssistantMessage[] => {
  if (!entries?.length) return [];
  return entries.map((entry) => ({
    id: entry.id,
    role: entry.role,
    content: entry.content,
    createdAt: entry.createdAt.toDate(),
    metadata: entry.metadata
  }));
};

const serializeMessages = (entries: AssistantMessage[]) =>
  entries.map((entry) => ({
    id: entry.id,
    role: entry.role,
    content: entry.content,
    createdAt: Timestamp.fromDate(entry.createdAt),
    metadata: entry.metadata
  }));

export const getConversationState = async (userId: string): Promise<AssistantConversationState> => {
  const snapshot = await collectionRef().doc(userId).get();
  if (!snapshot.exists) {
    return {
      userId,
      summary: null,
      topics: [],
      messages: [],
      updatedAt: new Date()
    };
  }
  const data = snapshot.data() as AssistantConversationDocument;
  return {
    userId,
    summary: data.summary ?? null,
    topics: data.topics ?? [],
    messages: deserializeMessages(data.messages),
    updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date()
  };
};

export const saveConversationState = async (state: AssistantConversationState) => {
  const messages = state.messages.slice(-MAX_STORED_MESSAGES);
  await collectionRef().doc(state.userId).set(
    {
      summary: state.summary ?? null,
      topics: state.topics,
      messages: serializeMessages(messages),
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
};

