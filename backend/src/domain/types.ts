import type { Timestamp } from "firebase-admin/firestore";
import type { HealthProfile } from "./validation.js";

export interface UserDocument {
  email: string;
  emailVerified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivityAt?: Timestamp;
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
  // Mirrors of legacy/existing fields on users collection
  consent?: Record<string, unknown>;
  privacySettings?: {
    dataUsage: boolean;
    profileVisibility: string;
    shareWithCoaches: boolean;
    shareWithResearch: boolean;
  };
  requiredProfile?: Record<string, unknown> | null;
  additionalProfile?: Record<string, unknown> | null;
  profileCompleted?: boolean;
  mfa?: {
    enabled: boolean;
    secret?: string | null;
    otpauthUrl?: string | null;
    enrolledAt?: Timestamp;
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

export interface HealthSummaryMetrics {
  averageWeight: number | null;
  averageBmi: number | null;
  averageWellnessScore: number | null;
  averageSleepHours: number | null;
  averageWaterIntake: number | null;
  totalWorkouts: number;
  averageWorkoutDuration: number | null;
  mostActiveDay: string | null;
  consistencyScore: number; // 0-100 based on regular activity
}

export interface HealthProgress {
  weightChange: number | null; // kg change from start to end
  bmiChange: number | null;
  wellnessScoreChange: number | null;
  sleepImprovement: number | null; // hours change
  waterIntakeImprovement: number | null; // liters change
  activityIncrease: number | null; // percentage increase in workouts
}

export interface HealthSummary {
  period: 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  metrics: HealthSummaryMetrics;
  progress: HealthProgress;
  keyInsights: string[];
  recommendations: string[];
  generatedAt: Date;
  aiInsights?: string;
  aiGeneratedAt?: string;
}

export interface HealthSummaryDocument {
  userId: string;
  summary: HealthSummary;
  createdAt: Timestamp;
}

export interface GoalMilestone {
  id: string;
  type: 'weight' | 'activity' | 'habit';
  title: string;
  description: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  progress: number; // 0-100
  achieved: boolean;
  achievedAt?: Date;
  category: string;
}

export interface GoalProgress {
  primaryGoal: string;
  milestones: GoalMilestone[];
  overallProgress: number; // 0-100
  completedMilestones: number;
  totalMilestones: number;
  estimatedCompletion?: Date;
}

export interface IngredientDocument {
  id: string;
  name: string;
  category: string;
  nutritionPer100g: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
    vitaminD: number;
    vitaminB12: number;
    iron: number;
    magnesium: number;
  };
  allergenTags: string[];
  sustainability: {
    carbonFootprint: "low" | "medium" | "high";
    waterUsage: "low" | "medium" | "high";
    processingLevel: "minimal" | "processed" | "highly_processed";
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number; // grams/ml standardized
  unit: "g" | "ml";
  originalUnit?: string;
  originalQuantity?: number;
  nutrition: IngredientDocument["nutritionPer100g"];
}

export interface RecipeDocument {
  id: string;
  title: string;
  cuisine: string;
  meal: string;
  servings: number;
  prepTimeMin: number;
  cookTimeMin: number;
  instructions: string;
  summary: string;
  dietaryTags: string[];
  allergenTags: string[];
  ingredients: RecipeIngredient[];
  macrosPerServing: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
  };
  micronutrientsPerServing: {
    vitaminD: number;
    vitaminB12: number;
    iron: number;
    magnesium: number;
  };
  sustainability: {
    glycemicIndex: number;
    nutrientDensityScore: number;
    satietyIndex: number;
    antioxidantProfile: {
      polyphenols: "low" | "medium" | "high";
      flavonoids: "low" | "medium" | "high";
      carotenoids: "low" | "medium" | "high";
    };
    environmentalImpact: {
      carbonFootprint: "low" | "medium" | "high";
      waterUsage: "low" | "medium" | "high";
    };
  };
  ratingAverage: number;
  ratingCount: number;
  ratingSum: number;
  embeddingId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RecipeEmbeddingDocument {
  id: string;
  recipeId: string;
  vector: number[];
  model: string;
  createdAt: Timestamp;
}

export interface RecipeReviewDocument {
  id: string;
  recipeId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: Timestamp;
  moderationStatus: "pending" | "approved" | "rejected";
}
