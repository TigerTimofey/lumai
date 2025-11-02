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

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    window.dispatchEvent(new CustomEvent('api:error', {
      detail: {
        path,
        status: null,
        message
      }
    }));
    throw new Error(message);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const message = text || `Request failed with status ${res.status}`;
    window.dispatchEvent(new CustomEvent('api:error', {
      detail: {
        path,
        status: res.status,
        message
      }
    }));
    throw new Error(message);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}
