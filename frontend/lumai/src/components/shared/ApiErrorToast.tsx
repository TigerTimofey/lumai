import React, { useEffect, useState } from 'react';

type ApiErrorDetail = {
  id: number;
  message: string;
  status: number | null;
  path: string;
};

const DISPLAY_DURATION_MS = 5000;

const ApiErrorToast: React.FC = () => {
  const [errors, setErrors] = useState<ApiErrorDetail[]>([]);

  useEffect(() => {
    let nextId = 0;

    const handleEvent = (event: Event) => {
      const custom = event as CustomEvent<{ message: string; status: number | null; path: string }>;
      if (!custom.detail?.message) return;

      const id = nextId++;
      const payload: ApiErrorDetail = {
        id,
        message: custom.detail.message,
        status: custom.detail.status ?? null,
        path: custom.detail.path
      };

      setErrors((prev) => [...prev, payload]);
      window.setTimeout(() => {
        setErrors((prev) => prev.filter((item) => item.id !== id));
      }, DISPLAY_DURATION_MS);
    };

    window.addEventListener('api:error', handleEvent);
    return () => {
      window.removeEventListener('api:error', handleEvent);
    };
  }, []);

  if (errors.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'grid',
        gap: 8,
        maxWidth: 320,
        zIndex: 9999
      }}
    >
      {errors.map((error) => (
        <div
          key={error.id}
          style={{
            background: 'rgba(239, 68, 68, 0.95)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 10,
            boxShadow: '0 16px 32px rgba(15, 23, 42, 0.25)',
            display: 'grid',
            gap: 4,
            fontSize: 13
          }}
          role="alert"
        >
          <strong style={{ fontSize: 14 }}>Request failed</strong>
          <span>{error.message}</span>
          <small style={{ opacity: 0.8 }}>
            {error.status != null ? `Status ${error.status}` : 'Network error'} · {error.path}
          </small>
        </div>
      ))}
    </div>
  );
};

export default ApiErrorToast;
