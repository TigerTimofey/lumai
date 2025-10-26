// types.ts
// Profile-related TypeScript types for re-use in profile components and logic

export type RequiredProfile = {
  activityLevel: string | null;
  age: number | null;
  fitnessGoal: string | null;
  gender: string | null;
  height: number | null; // cm
  weight: number | null; // kg
};

export type AdditionalProfile = {
  desiredActivityLevel: string | null;
  dietaryPreferences: string[] | null;
  dietaryRestrictions: string[] | null;
  endurance: number | null; // minutes or level
  exerciseTypes: string[] | null;
  fitnessLevel: string | null;
  occupationType: string | null;
  preferredEnvironment: string | null;
  preferredTimeOfDay: string | null;
  sessionDuration: string | null;
  strengthMetrics: {
    pushUps: number | null;
    squats: number | null;
    trainingDaysPerWeek: number | null;
  };
};

export type FirestoreUserConsent = {
  privacySettings: {
    dataUsage: boolean;
    profileVisibility: string;
    shareWithCoaches: boolean;
    shareWithResearch: boolean;
  };
  emailNotifications: {
    workoutReminders: boolean;
    progressUpdates: boolean;
    newsletter: boolean;
  };
};

export type FirestoreUser = {
  requiredProfile?: Partial<RequiredProfile> | null;
  additionalProfile?: Partial<AdditionalProfile> | null;
  profileCompleted?: boolean;
  consent?: FirestoreUserConsent | null;
  createdAt?: string | number | Date | null | { toDate?: () => Date };
};

export type ProfileSummary = {
  createdAt?: string | number | Date | null;
  displayName?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  requiredProfile?: Partial<RequiredProfile> | null;
  additionalProfile?: Partial<AdditionalProfile> | null;
};
