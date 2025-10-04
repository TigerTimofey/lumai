import { auth } from '../config/firebase';

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '') ?? '';
  const url = `${baseUrl}/api${path.startsWith('/') ? path : `/${path}`}`;

  const token = await auth.currentUser?.getIdToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}
