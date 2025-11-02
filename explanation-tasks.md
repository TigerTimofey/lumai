## Tasks Requiring Student Explanations

✅ 1. Student can explain how PII removal affects AI model's ability to generate personalized recommendations — We hash the identifiers (`privacyHash`) before storage, so personalization relies only on aggregated profile metrics. See [backend/src/services/processed-metrics.service.ts:33](backend/src/services/processed-metrics.service.ts#L33) and [backend/src/services/ai.service.ts:16](backend/src/services/ai.service.ts#L16).

✅ 2. Student can explain their strategy for detecting and handling AI hallucinations in health recommendations — At present we lean on provider timeouts, error logging, and fallback messaging without human review, as implemented in [backend/src/services/ai.service.ts:121](backend/src/services/ai.service.ts#L121).

✅ 8. Student can explain the security implications of access token duration in JWT authentication — The optional `SESSION_IDLE_MINUTES` window trades user convenience for reduced hijacking risk; enforcement happens in [backend/src/middleware/auth-context.ts:8](backend/src/middleware/auth-context.ts#L8) with configuration in [backend/src/config/env.ts:29](backend/src/config/env.ts#L29).

✅ 15. Student can explain how normalization of health metrics impacts data visualization accuracy — Converting inputs to consistent SI units prevents distorted charts and ensures BMI calculations match UI displays ([backend/src/domain/validation.ts:20](backend/src/domain/validation.ts#L20), [frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx:604](frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx#L604)).

✅ 20. Student can explain how BMI classifications affect wellness score calculation — BMI class feeds a weighted score with penalties for variance from the optimal range, directly altering the wellness bar ([frontend/lumai/src/components/pages/dashboard/profile/ProfileAnalyticsWidget.tsx:37](frontend/lumai/src/components/pages/dashboard/profile/ProfileAnalyticsWidget.tsx#L37)).

✅ 22. Student can explain their choice of AI model(s) based on response quality and latency requirements — We default to `meta-llama/Meta-Llama-3-8B-Instruct`, balancing health-coaching tone and 25 s timeout expectations; alternate Hugging Face models can be configured via env ([backend/src/services/ai.service.ts:92](backend/src/services/ai.service.ts#L92)).

✅ 23. Student can explain what model capabilities were most important for their implementation — Instruction-following reliability, Markdown formatting, and empathy cues drive our prompt design ([backend/src/services/ai.service.ts:72](backend/src/services/ai.service.ts#L72)).

✅ 26. Student can explain the difference between AI response caching and regeneration — `GET /ai/insights/latest` exposes the last saved insight (cache) while `POST /ai/insights` forces a fresh model call ([backend/src/routes/ai.routes.ts:11](backend/src/routes/ai.routes.ts#L11), [frontend/lumai/src/components/pages/dashboard/profile/AiInsightsWidget.tsx:20](frontend/lumai/src/components/pages/dashboard/profile/AiInsightsWidget.tsx#L20)).

✅ 27. Student can explain how context length affects AI response quality in health recommendations — We clamp serialized metrics to 6k characters; exceeding that truncates details and can reduce recommendation fidelity ([backend/src/services/ai.service.ts:72](backend/src/services/ai.service.ts#L72)).

✅ 30. Student can explain their prompt engineering approach to ensure consistent health recommendation format — A rigid Markdown template enforces sections for summary, recommendations, daily tasks, and motivation, which the UI then parses ([backend/src/services/ai.service.ts:72](backend/src/services/ai.service.ts#L72), [frontend/lumai/src/components/pages/dashboard/profile/AiInsightsWidget.tsx:66](frontend/lumai/src/components/pages/dashboard/profile/AiInsightsWidget.tsx#L66)).

✅ 32. Student can explain the tradeoffs between zero-shot and few-shot prompting in their implementation — We operate zero-shot for cost and latency reasons; adding exemplars would stabilize outputs but increase prompt size and maintenance overhead.

✅ 39. Student can explain how data visualization choices affect user's understanding of progress — Combining line, bar, doughnut, and radar charts surfaces trends, targets, and behavior balance to reduce cognitive load while scanning ([frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx:604](frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx#L604)).

✅ 43. Student can explain the impact of missing health data on AI recommendation accuracy — Missing inputs trigger neutral defaults (e.g., baseline stress), which keeps the pipeline running but may dilute personalized advice ([frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx:90](frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx#L90), [frontend/lumai/src/components/pages/dashboard/profile/ProfileAnalyticsWidget.tsx:116](frontend/lumai/src/components/pages/dashboard/profile/ProfileAnalyticsWidget.tsx#L116)).

✅ 45. Student can explain their approach to preventing API abuse through rate limiting — AI endpoints use a per-user in-memory throttle keyed by path with configurable window and ceilings ([backend/src/middleware/ai-rate-limit.ts:24](backend/src/middleware/ai-rate-limit.ts#L24)).

✅ 48. Student can explain the tradeoffs of their chosen data visualization library — Chart.js integrates smoothly with React and offers multiple chart types, though very dense datasets can impact frame rate ([frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx:1](frontend/lumai/src/components/pages/analytics/AnalyticsPage.tsx#L1)).

✅ 55. Student has implemented additional technologies, security enhancements and/or features beyond the core requirements — We added TOTP-based MFA and consent auditing to harden security and compliance ([backend/src/services/auth.service.ts:296](backend/src/services/auth.service.ts#L296), [frontend/lumai/src/components/pages/dashboard/security/TwoFactorWidget.tsx:1](frontend/lumai/src/components/pages/dashboard/security/TwoFactorWidget.tsx#L1), [backend/src/services/consent.service.ts:1](backend/src/services/consent.service.ts#L1)).
