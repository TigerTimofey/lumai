import crypto from "crypto";
import axios from "axios";
import env from "../config/env.js";

const FALLBACK_DIMENSION = 64;

const normalizeVector = (vector: number[]): number[] => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
};

const fallbackEmbedding = (text: string, dimensions = FALLBACK_DIMENSION): number[] => {
  const hash = crypto.createHash("sha256").update(text).digest();
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    const byte = hash[i % hash.length];
    const value = (byte / 255) * 2 - 1;
    vector.push(value);
  }
  return normalizeVector(vector);
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    const min = Math.min(a.length, b.length);
    a = a.slice(0, min);
    b = b.slice(0, min);
  }

  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (normA * normB);
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (env.HF_EMBEDDING_URL && env.HF_API_KEY) {
    try {
      const { data } = await axios.post(
        env.HF_EMBEDDING_URL,
        {
          inputs: text,
          model: env.HF_EMBEDDING_MODEL ?? env.HF_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2"
        },
        {
          headers: {
            Authorization: `Bearer ${env.HF_API_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 25_000
        }
      );

      const embedding =
        data?.data?.[0]?.embedding ??
        data?.embeddings?.[0] ??
        (Array.isArray(data?.[0]) ? data[0] : null);

      if (Array.isArray(embedding) && embedding.length > 0) {
        return embedding as number[];
      }
    } catch (error) {
      console.warn("[embedding] Falling back to deterministic embedding", error);
    }
  }

  return fallbackEmbedding(text);
};
