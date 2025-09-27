import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long"),
  displayName: z.string().min(1).max(120).optional()
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  mfaCode: z.string().min(6).max(6).optional()
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, "Refresh token is required")
});

export const oauthSchema = z.object({
  providerId: z.enum(["google.com", "github.com"], {
    errorMap: () => ({ message: "Supported providers are google.com and github.com" })
  }),
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
  mfaCode: z.string().min(6).max(6).optional()
}).refine((data) => data.idToken || data.accessToken, {
  message: "Either idToken or accessToken must be provided",
  path: ["idToken"]
});

export const passwordResetSchema = z.object({
  email: z.string().email("Enter a valid email")
});

export const sendVerificationSchema = z.object({
  email: z.string().email("Enter a valid email")
});

export const mfaEnrollSchema = z.object({
  label: z.string().max(64).optional()
});

export const mfaVerifySchema = z.object({
  code: z.string().min(6).max(6)
});
