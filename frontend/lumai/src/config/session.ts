const rawMinutes = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES);

export const SESSION_TIMEOUT_MS =
  Number.isFinite(rawMinutes) && rawMinutes > 0 ? rawMinutes * 60 * 1000 : 0;

