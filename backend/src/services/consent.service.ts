import { CONSENT_TYPES } from "../domain/enums.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getConsents, setConsents, updateConsentStatus } from "../repositories/consent.repo.js";
import { updateUserDocument } from "../repositories/user.repo.js";
import { privacyPreferencesSchema } from "../domain/validation.js";
import { badRequest } from "../utils/api-error.js";

const createDefaultConsents = () => ({
  agreements: {
    data_processing: {
      consentType: "data_processing",
      status: "pending" as const,
      updatedAt: Timestamp.now()
    },
    ai_insights: {
      consentType: "ai_insights",
      status: "pending" as const,
      updatedAt: Timestamp.now()
    },
    marketing: {
      consentType: "marketing",
      status: "pending" as const,
      updatedAt: Timestamp.now()
    }
  },
  sharingPreferences: {
    shareWithCoaches: false,
    shareWithResearch: false
  },
  notifications: {
    insights: true,
    reminders: true,
    marketing: false
  },
  auditTrail: []
});

export const getConsentSettings = async (userId: string) => {
  const consents = await getConsents(userId);
  if (consents) {
    const defaults = createDefaultConsents();
    const mergedAgreements = {
      ...defaults.agreements,
      ...(consents.agreements ?? {})
    } as typeof defaults.agreements;

    const merged = {
      ...defaults,
      ...consents,
      agreements: mergedAgreements
    };

    // If we had to add missing agreements, persist the merge.
    if (Object.keys(mergedAgreements).length !== Object.keys(consents.agreements ?? {}).length) {
      await setConsents(userId, merged);
    }

    return merged;
  }

  const defaults = createDefaultConsents();
  await setConsents(userId, defaults);
  await updateUserDocument(userId, {
    privacy: {
      profileVisibility: "private",
      shareWithCoaches: false,
      shareWithResearch: false,
      emailNotifications: defaults.notifications
    },
    privacySettings: {
      dataUsage: false,
      profileVisibility: "private",
      shareWithCoaches: false,
      shareWithResearch: false
    }
  });

  return defaults;
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
    // Primary mirror used by frontend
    privacy: {
      profileVisibility: parsed.profileVisibility,
      shareWithCoaches: parsed.shareWithCoaches,
      shareWithResearch: parsed.shareWithResearch,
      emailNotifications: parsed.emailNotifications
    },
    // Remove legacy/duplicate field to avoid duplicates in users/{uid}
    consent: FieldValue.delete() as any,
    privacySettings: {
      dataUsage: merged.agreements?.data_processing?.status === 'granted',
      profileVisibility: parsed.profileVisibility,
      shareWithCoaches: parsed.shareWithCoaches,
      shareWithResearch: parsed.shareWithResearch
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
  const updated = await getConsents(userId);

  if (consentType === 'data_processing') {
    const granted = status === 'granted';
    await updateUserDocument(userId, {
      consent: FieldValue.delete() as any,
      privacySettings: {
        dataUsage: granted
      } as any
    });
  }

  if (consentType === 'ai_insights') {
    await updateUserDocument(userId, {
      consent: FieldValue.delete() as any,
      privacy: {
        aiInsightsConsent: status
      } as any
    });
  }

  return updated;
};
