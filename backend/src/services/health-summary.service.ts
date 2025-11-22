import type {
  HealthSummary,
  HealthSummaryMetrics,
  HealthProgress,
  ProcessedMetricsDocument,
  UserDocument,
  NutritionalSnapshotDocument
} from "../domain/types.js";
import { getProcessedMetricsByDateRange } from "../repositories/processed-metrics.repo.js";
import { getWorkoutsByDateRange, type WorkoutEntry } from "../repositories/workout.repo.js";
import { getUserById } from "../repositories/user.repo.js";
import { listSnapshotsInRange } from "../repositories/calories.repo.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sessionDurationToMinutes = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  switch (value) {
    case "15-30":
      return 25;
    case "30-60":
      return 45;
    case "60+":
      return 70;
    default:
      return null;
  }
};

const stressToScore = (stress: unknown): number => {
  if (typeof stress !== "string") return 5;
  const key = stress.toLowerCase();
  if (key === "low") return 9;
  if (key === "moderate") return 6;
  if (key === "high") return 3;
  return 5;
};

const activityToScore = (activity: unknown): number => {
  if (typeof activity !== "string") return 45;
  const map: Record<string, number> = {
    sedentary: 20,
    light: 40,
    lightly_active: 55,
    moderate: 70,
    active: 80,
    very_active: 90,
    extra_active: 95
  };
  return map[activity] ?? 55;
};

const activityToTargetDays = (activity: string | null): number | null => {
  if (!activity) return null;
  const map: Record<string, number> = {
    sedentary: 2,
    light: 3,
    lightly_active: 3,
    moderate: 4,
    active: 5,
    very_active: 6,
    extra_active: 6
  };
  return map[activity] ?? null;
};

const bmiScore = (bmi: number | null): number => {
  if (bmi == null) return 50;
  const diff = Math.abs(bmi - 22);
  const penalty = Math.min(diff * 8, 70);
  return Math.max(100 - penalty, 20);
};

const trainingScore = (trainingDays: number | null, targetDays: number | null): number => {
  if (trainingDays == null) return 40;
  const goal = Math.max(targetDays ?? 5, 1);
  const ratio = Math.min(trainingDays / goal, 1);
  return Math.round(50 + ratio * 50);
};

const habitScore = (sleepHours: number | null, waterLiters: number | null, stressLevel: string | null): number => {
  let score = 55;
  if (sleepHours != null) {
    const diff = Math.abs(7 - sleepHours);
    score += Math.max(0, 10 - diff * 3);
  }
  if (waterLiters != null) {
    score += Math.min(waterLiters * 2, 15);
  }
  score += stressToScore(stressLevel) - 5;
  return Math.max(30, Math.min(score, 100));
};

const calculateSnapshotWellnessScore = (metrics: Record<string, unknown> | undefined): number | null => {
  if (!metrics) {
    return null;
  }

  const current = (metrics as any)?.current_state ?? {};
  const habits = (metrics as any)?.habits ?? {};
  const target = (metrics as any)?.target_state ?? {};
  const goals = (metrics as any)?.goals ?? {};
  const normalized = current?.normalized ?? (metrics as any)?.normalized ?? {};
  const strength = current?.strength ?? {};

  const bmi =
    toNumber(current?.bmi) ??
    toNumber(normalized?.bmi);

  const activityLevel =
    typeof current?.activity_level === "string"
      ? current.activity_level
      : typeof current?.activityLevel === "string"
        ? current.activityLevel
        : null;

  const trainingDays =
    toNumber(strength?.trainingDaysPerWeek) ??
    toNumber(current?.weekly_activity_frequency);

  const targetTraining =
    toNumber(target?.training_days_per_week) ??
    toNumber(target?.trainingDaysPerWeek) ??
    toNumber(goals?.trainingDaysPerWeek) ??
    activityToTargetDays(
      typeof target?.activity_level === "string"
        ? target.activity_level
        : typeof target?.activityLevel === "string"
          ? target.activityLevel
          : activityLevel
    );

  const sleepHours = toNumber(habits?.sleep_hours ?? habits?.sleepHours);
  const waterIntake = toNumber(habits?.water_intake_liters ?? habits?.waterIntakeLiters);
  const stressLevel =
    typeof habits?.stress_level === "string"
      ? habits.stress_level
      : typeof habits?.stressLevel === "string"
        ? habits.stressLevel
        : null;

  const bmiComponent = bmiScore(bmi);
  const activityComponent = activityToScore(activityLevel);
  const trainingComponent = trainingScore(trainingDays, targetTraining);
  const habitComponent = habitScore(sleepHours, waterIntake, stressLevel);

  const combined = Math.round(
    bmiComponent * 0.3 +
      activityComponent * 0.3 +
      trainingComponent * 0.2 +
      habitComponent * 0.2
  );

  return Math.max(0, Math.min(100, combined));
};

const aggregateNutritionSnapshots = (snapshots: NutritionalSnapshotDocument[]) => {
  if (!snapshots.length) {
    return {
      avgCalories: null,
      avgCalorieDelta: null,
      macroDelta: null,
      nutritionScore: null
    };
  }
  let calories = 0;
  let calorieDelta = 0;
  let proteinDelta = 0;
  let carbsDelta = 0;
  let fatsDelta = 0;
  let nutritionScoreTotal = 0;
  let scoreCount = 0;

  snapshots.forEach((snapshot) => {
    calories += snapshot.totals.calories;
    calorieDelta += snapshot.goalComparison.calorieDelta;
    proteinDelta += Math.abs(snapshot.goalComparison.proteinDelta);
    carbsDelta += Math.abs(snapshot.goalComparison.carbsDelta);
    fatsDelta += Math.abs(snapshot.goalComparison.fatsDelta);
    if (typeof snapshot.wellnessImpactScore === "number") {
      nutritionScoreTotal += snapshot.wellnessImpactScore;
      scoreCount++;
    }
  });

  const sampleCount = snapshots.length;
  return {
    avgCalories: calories / sampleCount,
    avgCalorieDelta: calorieDelta / sampleCount,
    macroDelta: {
      protein: proteinDelta / sampleCount,
      carbs: carbsDelta / sampleCount,
      fats: fatsDelta / sampleCount
    },
    nutritionScore: scoreCount > 0 ? nutritionScoreTotal / scoreCount : null
  };
};

const roundToSingleDecimal = (value: number | null): number | null => {
  if (value === null) return null;
  return Math.round(value * 10) / 10;
};

const countDaysInRange = (start: Date, end: Date): number => {
  const startAtMidnight = new Date(start);
  const endAtMidnight = new Date(end);
  startAtMidnight.setHours(0, 0, 0, 0);
  endAtMidnight.setHours(0, 0, 0, 0);
  const diffMs = endAtMidnight.getTime() - startAtMidnight.getTime();
  return Math.max(1, Math.round(diffMs / DAY_IN_MS) + 1);
};

const getUserHeightCm = (user: UserDocument | null): number | null => {
  if (!user) return null;
  const required = (user.requiredProfile ?? {}) as Record<string, unknown>;
  const additional = (user.additionalProfile ?? {}) as Record<string, unknown>;
  return (
    toNumber(required.height) ??
    toNumber(additional.height) ??
    null
  );
};

const getUserActivityLevel = (user: UserDocument | null): string | null => {
  if (!user) return null;
  const required = (user.requiredProfile ?? {}) as Record<string, unknown>;
  const additional = (user.additionalProfile ?? {}) as Record<string, unknown>;
  const desired = typeof additional.desiredActivityLevel === "string" ? additional.desiredActivityLevel : null;
  return (typeof required.activityLevel === "string" ? required.activityLevel : null) ?? desired;
};

const computeBmiFromWeight = (weightKg: number | null | undefined, heightCm: number | null): number | null => {
  if (weightKg == null || !Number.isFinite(weightKg)) return null;
  if (!heightCm || !Number.isFinite(heightCm) || heightCm <= 0) return null;
  const heightMeters = heightCm / 100;
  return weightKg / (heightMeters * heightMeters);
};

// Helper function to get start of week (Monday)
const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get end of week (Sunday)
const getEndOfWeek = (date: Date): Date => {
  const d = getStartOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Helper function to get start of month
const getStartOfMonth = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get end of month
const getEndOfMonth = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

// Calculate metrics from processed snapshots
const calculateMetrics = (
  snapshots: ProcessedMetricsDocument[],
  workouts: WorkoutEntry[],
  user: UserDocument | null,
  daysInPeriod: number,
  workoutsPerWeek: number | null,
  nutritionSnapshots: NutritionalSnapshotDocument[]
): HealthSummaryMetrics => {
  if (snapshots.length === 0 && workouts.length === 0 && nutritionSnapshots.length === 0) {
    return {
      averageWeight: null,
      averageBmi: null,
      averageWellnessScore: null,
      nutritionScore: null,
      averageCalorieIntake: null,
      averageCalorieDelta: null,
      macronutrientDelta: null,
      averageSleepHours: null,
      averageWaterIntake: null,
      totalWorkouts: 0,
      averageWorkoutDuration: null,
      mostActiveDay: null,
      consistencyScore: 0
    };
  }

  const heightCm = getUserHeightCm(user);
  const fallbackActivityLevel = getUserActivityLevel(user);

  let totalWeight = 0;
  let weightCount = 0;
  let totalBmi = 0;
  let bmiCount = 0;
  let totalWellnessScore = 0;
  let wellnessCount = 0;
  let totalSleep = 0;
  let sleepCount = 0;
  let totalWater = 0;
  let waterCount = 0;
  let totalWorkoutDurationMinutes = 0;
  let workoutDurationCount = 0;
  let totalWeeklyActivity = 0;
  let weeklyActivitySamples = 0;

  const dayActivity: Record<string, number> = {};
  const entryDays = new Set<string>();

  snapshots.forEach(snapshot => {
    const metrics = snapshot.userMetrics as any;
    const current = metrics?.current_state ?? {};
    const habits = metrics?.habits ?? {};
    const preferences = metrics?.preferences ?? {};
    const entryDate = snapshot.createdAt.toDate();
    entryDays.add(entryDate.toISOString().slice(0, 10));

    // Weight and BMI
    const weight = toNumber(current?.weight_kg);
    if (weight !== null) {
      totalWeight += weight;
      weightCount++;
    }
    const bmi = toNumber(current?.bmi);
    if (bmi !== null) {
      totalBmi += bmi;
      bmiCount++;
    }

    const wellnessScore = calculateSnapshotWellnessScore(metrics);
    if (wellnessScore !== null) {
      totalWellnessScore += wellnessScore;
      wellnessCount++;
    }

    // Habits
    const sleep = toNumber(habits?.sleep_hours);
    if (sleep !== null) {
      totalSleep += sleep;
      sleepCount++;
    }
    const water = toNumber(habits?.water_intake_liters);
    if (water !== null) {
      totalWater += water;
      waterCount++;
    }

    const weeklyActivity = toNumber(current?.weekly_activity_frequency);
    if (weeklyActivity !== null) {
      totalWeeklyActivity += weeklyActivity;
      weeklyActivitySamples++;
      const dayKey = entryDate.toLocaleDateString("en-US", { weekday: "long" });
      dayActivity[dayKey] = (dayActivity[dayKey] || 0) + weeklyActivity;
    }

    const sessionDuration = sessionDurationToMinutes(preferences?.session_duration);
    if (sessionDuration !== null) {
      totalWorkoutDurationMinutes += sessionDuration;
      workoutDurationCount++;
    }
  });

  workouts.forEach((workout) => {
    entryDays.add(workout.createdAt.toISOString().slice(0, 10));
    const dayKey = workout.createdAt.toLocaleDateString("en-US", { weekday: "long" });
    dayActivity[dayKey] = (dayActivity[dayKey] || 0) + 1;

    if (workout.weightKg != null) {
      totalWeight += workout.weightKg;
      weightCount++;
    }

    const workoutBmi = computeBmiFromWeight(workout.weightKg, heightCm);
    if (workoutBmi != null) {
      totalBmi += workoutBmi;
      bmiCount++;
    }

    if (workout.sleepHours != null) {
      totalSleep += workout.sleepHours;
      sleepCount++;
    }
    if (workout.waterLiters != null) {
      totalWater += workout.waterLiters;
      waterCount++;
    }

    if (workout.durationMinutes != null) {
      totalWorkoutDurationMinutes += workout.durationMinutes;
      workoutDurationCount++;
    }

    const workoutMetrics = {
      current_state: {
        bmi: workoutBmi,
        activity_level: workout.activityLevel ?? fallbackActivityLevel ?? null,
        weekly_activity_frequency: workoutsPerWeek ?? null,
        strength: {
          trainingDaysPerWeek: workoutsPerWeek ?? null
        }
      },
      habits: {
        sleep_hours: workout.sleepHours ?? null,
        water_intake_liters: workout.waterLiters ?? null,
        stress_level: workout.stressLevel ?? null
      },
      target_state: {},
      goals: {}
    } as Record<string, unknown>;

    const workoutWellness = calculateSnapshotWellnessScore(workoutMetrics);
    if (workoutWellness !== null) {
      totalWellnessScore += workoutWellness;
      wellnessCount++;
    }
  });

  nutritionSnapshots.forEach((snapshot) => {
    entryDays.add(snapshot.date);
  });

  // Find most active day
  let mostActiveDay: string | null = null;
  let maxActivity = 0;
  Object.entries(dayActivity).forEach(([day, count]) => {
    if (count > maxActivity) {
      maxActivity = count;
      mostActiveDay = day;
    }
  });

  // Calculate consistency score based on regular data entries
  const uniqueEntryDays = entryDays.size;
  const consistencyScore = Math.min(
    100,
    Math.round((uniqueEntryDays / Math.max(daysInPeriod, 1)) * 100)
  );

  const averageWeeklyActivity =
    weeklyActivitySamples > 0 ? totalWeeklyActivity / weeklyActivitySamples : null;
  const scaledTotalWorkouts =
    workouts.length > 0
      ? workouts.length
      : averageWeeklyActivity !== null
        ? Math.round(averageWeeklyActivity * (daysInPeriod / 7))
        : 0;

  const nutritionAggregation = aggregateNutritionSnapshots(nutritionSnapshots);
  let averageWellnessScore =
    wellnessCount > 0 ? roundToSingleDecimal(totalWellnessScore / wellnessCount) : null;
  if (nutritionAggregation.nutritionScore != null) {
    averageWellnessScore =
      averageWellnessScore != null
        ? roundToSingleDecimal(
            averageWellnessScore * 0.8 + nutritionAggregation.nutritionScore * 0.2
          )
        : roundToSingleDecimal(nutritionAggregation.nutritionScore);
  }

  return {
    averageWeight: weightCount > 0 ? roundToSingleDecimal(totalWeight / weightCount) : null,
    averageBmi: bmiCount > 0 ? roundToSingleDecimal(totalBmi / bmiCount) : null,
    averageWellnessScore,
    nutritionScore:
      nutritionAggregation.nutritionScore != null
        ? roundToSingleDecimal(nutritionAggregation.nutritionScore)
        : null,
    averageCalorieIntake:
      nutritionAggregation.avgCalories != null
        ? roundToSingleDecimal(nutritionAggregation.avgCalories)
        : null,
    averageCalorieDelta:
      nutritionAggregation.avgCalorieDelta != null
        ? roundToSingleDecimal(nutritionAggregation.avgCalorieDelta)
        : null,
    macronutrientDelta: nutritionAggregation.macroDelta
      ? {
          protein: roundToSingleDecimal(Math.abs(nutritionAggregation.macroDelta.protein)),
          carbs: roundToSingleDecimal(Math.abs(nutritionAggregation.macroDelta.carbs)),
          fats: roundToSingleDecimal(Math.abs(nutritionAggregation.macroDelta.fats))
        }
      : null,
    averageSleepHours: sleepCount > 0 ? roundToSingleDecimal(totalSleep / sleepCount) : null,
    averageWaterIntake: waterCount > 0 ? roundToSingleDecimal(totalWater / waterCount) : null,
    totalWorkouts: scaledTotalWorkouts,
    averageWorkoutDuration:
      workoutDurationCount > 0 ? roundToSingleDecimal(totalWorkoutDurationMinutes / workoutDurationCount) : null,
    mostActiveDay,
    consistencyScore: Math.round(consistencyScore)
  };
};

// Calculate progress from start to end of period
const calculateProgress = (
  snapshots: ProcessedMetricsDocument[],
  workouts: WorkoutEntry[],
  user: UserDocument | null,
  workoutsPerWeek: number | null,
  periodStart: Date,
  periodEnd: Date
): HealthProgress => {
  const heightCm = getUserHeightCm(user);
  const fallbackActivityLevel = getUserActivityLevel(user);

  type CombinedPoint = {
    date: Date;
    weight: number | null;
    bmi: number | null;
    wellness: number | null;
    sleep: number | null;
    water: number | null;
    weeklyActivity: number | null;
  };

  const combined: CombinedPoint[] = [];

  snapshots.forEach((snapshot) => {
    const metrics = snapshot.userMetrics as any;
    const current = metrics?.current_state ?? {};
    const habits = metrics?.habits ?? {};
    const createdAt = snapshot.createdAt.toDate();

    combined.push({
      date: createdAt,
      weight: toNumber(current?.weight_kg),
      bmi: toNumber(current?.bmi),
      wellness: calculateSnapshotWellnessScore(metrics),
      sleep: toNumber(habits?.sleep_hours),
      water: toNumber(habits?.water_intake_liters),
      weeklyActivity: toNumber(current?.weekly_activity_frequency)
    });
  });

  workouts.forEach((workout) => {
    const bmi = computeBmiFromWeight(workout.weightKg, heightCm);
    const workoutMetrics = {
      current_state: {
        bmi,
        activity_level: workout.activityLevel ?? fallbackActivityLevel ?? null,
        weekly_activity_frequency: workoutsPerWeek ?? null,
        strength: {
          trainingDaysPerWeek: workoutsPerWeek ?? null
        }
      },
      habits: {
        sleep_hours: workout.sleepHours ?? null,
        water_intake_liters: workout.waterLiters ?? null,
        stress_level: workout.stressLevel ?? null
      },
      target_state: {},
      goals: {}
    } as Record<string, unknown>;

    combined.push({
      date: workout.createdAt,
      weight: workout.weightKg ?? null,
      bmi,
      wellness: calculateSnapshotWellnessScore(workoutMetrics),
      sleep: workout.sleepHours ?? null,
      water: workout.waterLiters ?? null,
      weeklyActivity: null
    });
  });

  const sorted = combined
    .filter((entry) => entry.date instanceof Date && !Number.isNaN(entry.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const computeChange = (selector: (point: CombinedPoint) => number | null): number | null => {
    const series = sorted.filter((point) => selector(point) != null);
    if (series.length === 0) return null;
    const startValue = selector(series[0]);
    const endValue = selector(series[series.length - 1]);
    if (startValue == null || endValue == null) return null;
    return endValue - startValue;
  };

  const weightChange = computeChange((point) => point.weight);
  const bmiChange = computeChange((point) => point.bmi);
  const wellnessChange = computeChange((point) => point.wellness);
  const sleepImprovement = computeChange((point) => point.sleep);
  const waterImprovement = computeChange((point) => point.water);

  let activityIncrease = computeChange((point) => point.weeklyActivity);
  if (activityIncrease === null && workouts.length > 0) {
    const periodMidpoint =
      periodStart.getTime() + (periodEnd.getTime() - periodStart.getTime()) / 2;
    const firstHalf = workouts.filter((workout) => workout.createdAt.getTime() <= periodMidpoint).length;
    const secondHalf = workouts.length - firstHalf;
    if (firstHalf === 0) {
      activityIncrease = secondHalf > 0 ? 100 : 0;
    } else {
      activityIncrease = ((secondHalf - firstHalf) / firstHalf) * 100;
    }
  }

  return {
    weightChange: roundToSingleDecimal(weightChange),
    bmiChange: roundToSingleDecimal(bmiChange),
    wellnessScoreChange: roundToSingleDecimal(wellnessChange),
    sleepImprovement: roundToSingleDecimal(sleepImprovement),
    waterIntakeImprovement: roundToSingleDecimal(waterImprovement),
    activityIncrease: roundToSingleDecimal(activityIncrease)
  };
};

// Generate key insights based on metrics and progress
const generateInsights = (metrics: HealthSummaryMetrics, progress: HealthProgress): string[] => {
  const insights: string[] = [];

  if (metrics.averageWellnessScore !== null) {
    if (metrics.averageWellnessScore >= 80) {
      insights.push("Excellent overall wellness score - keep up the great work!");
    } else if (metrics.averageWellnessScore >= 60) {
      insights.push("Good wellness score with room for improvement in some areas.");
    } else {
      insights.push("Wellness score indicates areas needing attention for better health.");
    }
  }

  if (metrics.nutritionScore != null) {
    insights.push(`Nutrition adherence score averaged ${Math.round(metrics.nutritionScore)} points.`);
  }

  if (metrics.averageCalorieIntake !== null) {
    insights.push(`Average calorie intake was ${metrics.averageCalorieIntake.toFixed(0)} kcal per day.`);
  }

  if (metrics.averageCalorieDelta !== null) {
    if (metrics.averageCalorieDelta > 150) {
      insights.push(`Calorie intake exceeded targets by roughly ${metrics.averageCalorieDelta.toFixed(0)} kcal.`);
    } else if (metrics.averageCalorieDelta < -150) {
      insights.push(`Calorie intake was about ${Math.abs(metrics.averageCalorieDelta).toFixed(0)} kcal under target.`);
    }
  }

  if (metrics.macronutrientDelta) {
    const macroFlags: string[] = [];
    if (metrics.macronutrientDelta.protein && metrics.macronutrientDelta.protein > 10) {
      macroFlags.push("protein");
    }
    if (metrics.macronutrientDelta.carbs && metrics.macronutrientDelta.carbs > 15) {
      macroFlags.push("carbs");
    }
    if (metrics.macronutrientDelta.fats && metrics.macronutrientDelta.fats > 10) {
      macroFlags.push("fats");
    }
    if (macroFlags.length) {
      insights.push(`Macro intake fluctuated for ${macroFlags.join(", ")} compared to goals.`);
    }
  }

  if (progress.weightChange !== null) {
    if (Math.abs(progress.weightChange) < 0.5) {
      insights.push("Weight remained stable throughout the period.");
    } else if (progress.weightChange > 0) {
      insights.push(`Weight increased by ${progress.weightChange.toFixed(1)}kg.`);
    } else {
      insights.push(`Weight decreased by ${Math.abs(progress.weightChange).toFixed(1)}kg.`);
    }
  }

  if (metrics.averageSleepHours !== null) {
    if (metrics.averageSleepHours >= 7) {
      insights.push("Good sleep habits with adequate rest hours.");
    } else {
      insights.push("Sleep duration could be improved for better recovery.");
    }
  }

  if (metrics.totalWorkouts > 0) {
    insights.push(`Completed ${metrics.totalWorkouts} workouts with ${metrics.consistencyScore}% consistency.`);
  }

  if (metrics.mostActiveDay) {
    insights.push(`${metrics.mostActiveDay} was your most active day.`);
  }

  return insights;
};

// Generate recommendations based on metrics and progress
const generateRecommendations = (metrics: HealthSummaryMetrics, progress: HealthProgress): string[] => {
  const recommendations: string[] = [];

  if (metrics.averageWellnessScore !== null && metrics.averageWellnessScore < 70) {
    recommendations.push("Focus on improving your overall wellness score through consistent healthy habits.");
  }

  if (metrics.averageSleepHours !== null && metrics.averageSleepHours < 7) {
    recommendations.push("Aim for 7-9 hours of sleep per night for optimal recovery.");
  }

  if (metrics.averageWaterIntake !== null && metrics.averageWaterIntake < 2) {
    recommendations.push("Increase daily water intake to at least 2 liters for better hydration.");
  }

  if (metrics.averageCalorieDelta !== null) {
    if (metrics.averageCalorieDelta > 150) {
      recommendations.push("Favor lighter meals or reduce portion sizes to stay within calorie targets.");
    } else if (metrics.averageCalorieDelta < -150) {
      recommendations.push("Add a nutrient-dense snack to avoid dipping too far below your calorie plan.");
    }
  }

  if (metrics.macronutrientDelta?.protein && metrics.macronutrientDelta.protein > 12) {
    recommendations.push("Include lean protein (fish, legumes, yogurt) to stabilise protein intake.");
  }

  if (metrics.nutritionScore != null && metrics.nutritionScore < 70) {
    recommendations.push("Log meals consistently so nutrition data can refine your plan in real time.");
  }

  if (metrics.consistencyScore < 70) {
    recommendations.push("Try to maintain more consistent health tracking for better insights.");
  }

  if (progress.weightChange !== null && Math.abs(progress.weightChange) > 2) {
    recommendations.push("Consult with a healthcare professional about significant weight changes.");
  }

  if (metrics.totalWorkouts === 0) {
    recommendations.push("Consider incorporating regular exercise into your routine.");
  }

  return recommendations;
};

const ensureSummaryRelevance = (
  summary: HealthSummary,
  metrics: HealthSummaryMetrics,
  progress: HealthProgress
): HealthSummary => {
  const insights = [...summary.keyInsights];
  const recommendations = [...summary.recommendations];

  const hasWeight = metrics.averageWeight != null;
  const hasWellness = metrics.averageWellnessScore != null;
  const hasWorkouts = metrics.totalWorkouts > 0;
  const hasSleep = metrics.averageSleepHours != null;
  const hasHydration = metrics.averageWaterIntake != null;
  const hasNutrition =
    metrics.averageCalorieIntake != null ||
    metrics.averageCalorieDelta != null ||
    (metrics.macronutrientDelta != null && metrics.macronutrientDelta.protein != null);
  const hasAnyMetric =
    hasWeight || hasWellness || hasWorkouts || hasSleep || hasHydration || hasNutrition;

  const pushInsight = (message: string) => {
    if (!insights.includes(message)) insights.push(message);
  };

  const pushRecommendation = (message: string) => {
    if (!recommendations.includes(message)) recommendations.push(message);
  };

  if (!hasAnyMetric) {
    pushInsight(
      `Not enough tracked data ${summary.period === "weekly" ? "this week" : "this month"}. Log workouts, sleep, hydration, and weight to unlock richer guidance.`
    );
    pushRecommendation(
      `Capture at least one workout and daily habits so the ${summary.period} summary can surface trends and personalised tips.`
    );
  } else {
    if (insights.length === 0) {
      if (hasWellness) {
        pushInsight(`Wellness score averaged ${Math.round(metrics.averageWellnessScore!)} points this ${summary.period}.`);
      }
      if (hasWorkouts) {
        pushInsight(`Logged ${metrics.totalWorkouts} workouts with ${metrics.consistencyScore}% consistency.`);
      }
      if (hasSleep) {
        pushInsight(`Sleep averaged ${metrics.averageSleepHours?.toFixed(1)} hours per night.`);
      }
      if (hasNutrition && metrics.averageCalorieIntake != null) {
        pushInsight(`Nutrition logging shows ~${metrics.averageCalorieIntake.toFixed(0)} kcal per day.`);
      }
      if (!insights.length) {
        pushInsight('Your logging is up to date—keep capturing weight, sleep, and hydration to reveal deeper trends.');
      }
    }

    if (recommendations.length === 0) {
      if (hasWorkouts) {
        if ((progress.activityIncrease ?? 0) < 0) {
          pushRecommendation('Revisit your weekly plan and reserve two training blocks you can consistently protect.');
        } else {
          pushRecommendation('Maintain your workout cadence by scheduling sessions and recovery in advance.');
        }
      }
      if (hasSleep && metrics.averageSleepHours! < 7) {
        pushRecommendation('Prioritise a wind-down routine to reach at least 7 hours of sleep nightly.');
      }
      if (hasHydration && metrics.averageWaterIntake! < 2) {
        pushRecommendation('Carry a water bottle and target 2 litres throughout the day to support recovery.');
      }
      if (!recommendations.length) {
        pushRecommendation('Set one clear habit focus (sleep, training, or nutrition) and track it for the upcoming period.');
      }
    }
  }

  return {
    ...summary,
    keyInsights: insights,
    recommendations
  };
};

// Generate weekly health summary
export const generateWeeklySummary = async (userId: string, referenceDate: Date = new Date()): Promise<HealthSummary> => {
  const weekStart = getStartOfWeek(referenceDate);
  const weekEnd = getEndOfWeek(referenceDate);

  const [snapshots, user, workouts, nutritionSnapshots] = await Promise.all([
    getProcessedMetricsByDateRange(userId, weekStart, weekEnd),
    getUserById(userId),
    getWorkoutsByDateRange(userId, weekStart, weekEnd),
    listSnapshotsInRange(userId, formatDateKey(weekStart), formatDateKey(weekEnd))
  ]);

  const daysInPeriod = countDaysInRange(weekStart, weekEnd);
  const workoutsPerWeek =
    workouts.length > 0 ? (workouts.length / Math.max(daysInPeriod, 1)) * 7 : null;

  const metrics = calculateMetrics(
    snapshots,
    workouts,
    user,
    daysInPeriod,
    workoutsPerWeek,
    nutritionSnapshots
  );
  const progress = calculateProgress(
    snapshots,
    workouts,
    user,
    workoutsPerWeek,
    weekStart,
    weekEnd
  );
  const insights = generateInsights(metrics, progress);
  const recommendations = generateRecommendations(metrics, progress);

  return ensureSummaryRelevance({
    period: 'weekly',
    startDate: weekStart,
    endDate: weekEnd,
    metrics,
    progress,
    keyInsights: insights,
    recommendations,
    generatedAt: new Date()
  }, metrics, progress);
};

// Generate monthly health summary
export const generateMonthlySummary = async (userId: string, referenceDate: Date = new Date()): Promise<HealthSummary> => {
  const monthStart = getStartOfMonth(referenceDate);
  const monthEnd = getEndOfMonth(referenceDate);

  const [snapshots, user, workouts, nutritionSnapshots] = await Promise.all([
    getProcessedMetricsByDateRange(userId, monthStart, monthEnd),
    getUserById(userId),
    getWorkoutsByDateRange(userId, monthStart, monthEnd),
    listSnapshotsInRange(userId, formatDateKey(monthStart), formatDateKey(monthEnd))
  ]);

  const daysInPeriod = countDaysInRange(monthStart, monthEnd);
  const workoutsPerWeek =
    workouts.length > 0 ? (workouts.length / Math.max(daysInPeriod, 1)) * 7 : null;

  const metrics = calculateMetrics(
    snapshots,
    workouts,
    user,
    daysInPeriod,
    workoutsPerWeek,
    nutritionSnapshots
  );
  const progress = calculateProgress(
    snapshots,
    workouts,
    user,
    workoutsPerWeek,
    monthStart,
    monthEnd
  );
  const insights = generateInsights(metrics, progress);
  const recommendations = generateRecommendations(metrics, progress);

  return ensureSummaryRelevance({
    period: 'monthly',
    startDate: monthStart,
    endDate: monthEnd,
    metrics,
    progress,
    keyInsights: insights,
    recommendations,
    generatedAt: new Date()
  }, metrics, progress);
};
