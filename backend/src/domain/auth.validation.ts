import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z
    .string()
    .min(6, "Пароль должен содержать минимум 6 символов"),
  displayName: z.string().min(1).max(120).optional()
});

export const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(1, "Пароль обязателен"),
  mfaCode: z.string().min(6).max(6).optional()
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, "Refresh token обязателен")
});

export const oauthSchema = z.object({
  providerId: z.enum(["google.com", "github.com"], {
    errorMap: () => ({ message: "Поддерживаются только google.com и github.com" })
  }),
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
  mfaCode: z.string().min(6).max(6).optional()
}).refine((data) => data.idToken || data.accessToken, {
  message: "Нужно передать idToken или accessToken",
  path: ["idToken"]
});

export const passwordResetSchema = z.object({
  email: z.string().email("Введите корректный email")
});

export const sendVerificationSchema = z.object({
  email: z.string().email("Введите корректный email")
});

export const mfaEnrollSchema = z.object({
  label: z.string().max(64).optional()
});

export const mfaVerifySchema = z.object({
  code: z.string().min(6).max(6)
});
