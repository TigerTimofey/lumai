import type { Timestamp } from "firebase-admin/firestore";
import type { HealthProfile } from "./validation";

export interface UserDocument {
  email: string;
  emailVerified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  profileVersionId?: string | null;
  privacy: {
    profileVisibility: string;
    shareWithResearch: boolean;
    shareWithCoaches: boolean;
    emailNotifications: {
      insights: boolean;
      reminders: boolean;
      marketing: boolean;
    };
  };
}

export interface HealthProfileVersionDocument {
  versionId: string;
  userId: string;
  demographics: HealthProfile["demographics"];
  physicalMetrics: HealthProfile["physicalMetrics"];
  lifestyle: HealthProfile["lifestyle"];
  goals: HealthProfile["goals"];
  assessment: HealthProfile["assessment"];
  habits: HealthProfile["habits"];
  normalized: HealthProfile["normalized"];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  source: "user" | "system" | "import";
}

export interface HealthProfileDocument {
  current: {
    demographics: HealthProfile["demographics"];
    physicalMetrics: HealthProfile["physicalMetrics"];
    lifestyle: HealthProfile["lifestyle"];
    goals: HealthProfile["goals"];
    assessment: HealthProfile["assessment"];
    habits: HealthProfile["habits"];
    normalized: HealthProfile["normalized"];
    updatedAt: Timestamp;
  };
  targets: {
    targetWeightKg?: number;
    targetActivityLevel?: string;
  };
  stats: {
    versionsCount: number;
    lastUpdated: Timestamp;
  };
}

export interface ConsentRecord {
  consentType: string;
  status: "granted" | "denied" | "pending";
  updatedAt: Timestamp;
}

export interface ConsentsDocument {
  agreements: Record<string, ConsentRecord>;
  sharingPreferences: {
    shareWithResearch: boolean;
    shareWithCoaches: boolean;
  };
  notifications: {
    insights: boolean;
    reminders: boolean;
    marketing: boolean;
  };
  auditTrail?: Array<{
    consentType: string;
    previousStatus: string;
    newStatus: string;
    changedAt: Timestamp;
    changedBy: string;
  }>;
}

export interface ProcessedMetricsDocument {
  userMetrics: Record<string, unknown>;
  privacyHash: string;
  sourceProfileVersion: string;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}
