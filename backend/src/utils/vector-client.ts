import env from "../config/env.js";

type VectorPoint = {
  id: string;
  vector: number[];
  payload?: Record<string, unknown>;
};

const vectorConfig = env.VECTOR_DB_URL && env.VECTOR_DB_COLLECTION
  ? {
      baseUrl: env.VECTOR_DB_URL.replace(/\/$/, ""),
      collection: env.VECTOR_DB_COLLECTION
    }
  : null;

const fetchJson = async <T>(url: string, init: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vector DB request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
};

export const isVectorDbEnabled = () => Boolean(vectorConfig);

export const ensureVectorCollection = async (dimension: number) => {
  if (!vectorConfig) return;
  try {
    await fetchJson(`${vectorConfig.baseUrl}/collections/${vectorConfig.collection}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: dimension,
          distance: "Cosine"
        }
      })
    });
  } catch (error) {
    // If collection exists, Qdrant returns 409; ignore
    if (!(error instanceof Error && error.message.includes("409"))) {
      throw error;
    }
  }
};

export const upsertVectors = async (points: VectorPoint[]) => {
  if (!vectorConfig || !points.length) return;
  await fetchJson(`${vectorConfig.baseUrl}/collections/${vectorConfig.collection}/points`, {
    method: "PUT",
    body: JSON.stringify({
      points: points.map((point) => ({
        id: point.id,
        vector: point.vector,
        payload: point.payload ?? {}
      }))
    })
  });
};

type VectorSearchResult = {
  id: string;
  score: number;
};

export const vectorSearch = async (vector: number[], limit = 10): Promise<VectorSearchResult[]> => {
  if (!vectorConfig) return [];
  const data = await fetchJson<{
    result: Array<{ id: string | number; score: number }>;
  }>(`${vectorConfig.baseUrl}/collections/${vectorConfig.collection}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector,
      limit,
      with_payload: false
    })
  });
  return data.result.map((item) => ({
    id: item.id.toString(),
    score: item.score
  }));
};
