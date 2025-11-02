import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  FIREBASE_SERVICE_ACCOUNT_KEY: z
    .string()
    .min(1, "FIREBASE_SERVICE_ACCOUNT_KEY is required"),
  WEB_API_KEY: z.string().min(1, "WEB_API_KEY is required"),
  ANONYMIZATION_SALT: z.string().min(1).default("development"),
  HF_API_URL: z.string().url().optional(),
  HF_API_KEY: z.string().optional(),
  HF_MODEL: z.string().optional(),
  AI_RATE_LIMIT_MAX: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().int().positive().optional()),
  AI_RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().int().positive().optional()),
  API_RATE_LIMIT_MAX: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().int().positive().optional()),
  API_RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().int().positive().optional()),
  ALLOW_UNVERIFIED_LOGIN: z
    .preprocess((v) => (typeof v === "string" ? v === "true" : false), z.boolean())
    .default(false),
  SESSION_IDLE_MINUTES: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 0))
    .pipe(z.number().int().min(0)),
  PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 4000))
    .pipe(z.number().int().positive()),
  FRONTEND_URL: z.string().url()
});

type EnvConfig = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Environment validation error", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check your .env file.");
}

const env: EnvConfig & { serviceAccount: Record<string, unknown> } = {
  ...parsed.data,
  serviceAccount: JSON.parse(
    Buffer.from(parsed.data.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString()
  )
};

export default env;
