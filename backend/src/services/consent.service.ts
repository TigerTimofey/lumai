import { CONSENT_TYPES } from "../domain/enums.js";
import { getConsents, setConsents, updateConsentStatus } from "../repositories/consent.repo.js";
import { updateUserDocument } from "../repositories/user.repo.js";
import { privacyPreferencesSchema } from "../domain/validation.js";
import { badRequest, notFound } from "../utils/api-error.js";

export const getConsentSettings = async (userId: string) => {
  const consents = await getConsents(userId);
  if (!consents) {
    throw notFound("Consent record not found");
  }
  return consents;
};

export const updatePrivacyPreferences = async (
  userId: string,
  payload: Parameters<typeof privacyPreferencesSchema.parse>[0]
) => {
  const parsed = privacyPreferencesSchema.parse(payload ?? {});

  const consents = await getConsents(userId);
  const merged = {
    agreements: consents?.agreements ?? {},
    sharingPreferences: {
      shareWithCoaches: parsed.shareWithCoaches,
      shareWithResearch: parsed.shareWithResearch
    },
    notifications: {
      insights: parsed.emailNotifications.insights,
      reminders: parsed.emailNotifications.reminders,
      marketing: parsed.emailNotifications.marketing
    },
    auditTrail: consents?.auditTrail ?? []
  };

  await setConsents(userId, merged);
  await updateUserDocument(userId, {
    privacy: {
      profileVisibility: parsed.profileVisibility,
      shareWithCoaches: parsed.shareWithCoaches,
      shareWithResearch: parsed.shareWithResearch,
      emailNotifications: parsed.emailNotifications
    }
  });

  return merged;
};

export const recordConsent = async (
  userId: string,
  consentType: string,
  status: "granted" | "denied" | "pending",
  changedBy: string
) => {
  if (!CONSENT_TYPES.includes(consentType as (typeof CONSENT_TYPES)[number])) {
    throw badRequest("Unsupported consent type");
  }

  if (!status) {
    throw badRequest("Consent status is required");
  }

  await updateConsentStatus(userId, consentType, status, changedBy);
  return getConsents(userId);
};
