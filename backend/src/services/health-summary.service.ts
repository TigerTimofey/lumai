import { Timestamp } from "firebase-admin/firestore";
import type { HealthSummary, HealthSummaryMetrics, HealthProgress, ProcessedMetricsDocument } from "../domain/types.js";
import { getProcessedMetricsByDateRange } from "../repositories/processed-metrics.repo.js";

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

// Calculate metrics from processed snapshots
const calculateMetrics = (snapshots: ProcessedMetricsDocument[]): HealthSummaryMetrics => {
  if (snapshots.length === 0) {
    return {
      averageWeight: null,
      averageBmi: null,
      averageWellnessScore: null,
      averageSleepHours: null,
      averageWaterIntake: null,
      totalWorkouts: 0,
      averageWorkoutDuration: null,
      mostActiveDay: null,
      consistencyScore: 0
    };
  }

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
  let totalWorkouts = 0;
  let totalWorkoutDuration = 0;
  let workoutDurationCount = 0;

  const dayActivity: Record<string, number> = {};

  snapshots.forEach(snapshot => {
    const metrics = snapshot.userMetrics as any;

    // Weight and BMI
    if (metrics?.current_state?.weight_kg) {
      totalWeight += metrics.current_state.weight_kg;
      weightCount++;
    }
    if (metrics?.current_state?.bmi) {
      totalBmi += metrics.current_state.bmi;
      bmiCount++;
    }

    // Wellness score (if available in metrics)
    if (metrics?.wellness_score) {
      totalWellnessScore += metrics.wellness_score;
      wellnessCount++;
    }

    // Habits
    if (metrics?.habits?.sleep_hours) {
      totalSleep += metrics.habits.sleep_hours;
      sleepCount++;
    }
    if (metrics?.habits?.water_intake_liters) {
      totalWater += metrics.habits.water_intake_liters;
      waterCount++;
    }

    // Workouts (if tracked in metrics)
    if (metrics?.workouts) {
      const workouts = Array.isArray(metrics.workouts) ? metrics.workouts : [];
      totalWorkouts += workouts.length;
      workouts.forEach((workout: any) => {
        if (workout.duration_minutes) {
          totalWorkoutDuration += workout.duration_minutes;
          workoutDurationCount++;
        }
        if (workout.created_at) {
          const date = new Date(workout.created_at);
          const dayKey = date.toLocaleDateString('en-US', { weekday: 'long' });
          dayActivity[dayKey] = (dayActivity[dayKey] || 0) + 1;
        }
      });
    }
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
  const totalDays = snapshots.length;
  const expectedEntries = Math.max(totalDays, 1); // At least 1 expected
  const consistencyScore = Math.min((totalDays / expectedEntries) * 100, 100);

  return {
    averageWeight: weightCount > 0 ? totalWeight / weightCount : null,
    averageBmi: bmiCount > 0 ? totalBmi / bmiCount : null,
    averageWellnessScore: wellnessCount > 0 ? totalWellnessScore / wellnessCount : null,
    averageSleepHours: sleepCount > 0 ? totalSleep / sleepCount : null,
    averageWaterIntake: waterCount > 0 ? totalWater / waterCount : null,
    totalWorkouts,
    averageWorkoutDuration: workoutDurationCount > 0 ? totalWorkoutDuration / workoutDurationCount : null,
    mostActiveDay,
    consistencyScore: Math.round(consistencyScore)
  };
};

// Calculate progress from start to end of period
const calculateProgress = (snapshots: ProcessedMetricsDocument[]): HealthProgress => {
  if (snapshots.length < 2) {
    return {
      weightChange: null,
      bmiChange: null,
      wellnessScoreChange: null,
      sleepImprovement: null,
      waterIntakeImprovement: null,
      activityIncrease: null
    };
  }

  // Sort by creation date
  const sortedSnapshots = snapshots.sort((a, b) =>
    a.createdAt.toDate().getTime() - b.createdAt.toDate().getTime()
  );

  const first = sortedSnapshots[0].userMetrics as any;
  const last = sortedSnapshots[sortedSnapshots.length - 1].userMetrics as any;

  const weightStart = first?.current_state?.weight_kg;
  const weightEnd = last?.current_state?.weight_kg;
  const weightChange = (weightStart && weightEnd) ? weightEnd - weightStart : null;

  const bmiStart = first?.current_state?.bmi;
  const bmiEnd = last?.current_state?.bmi;
  const bmiChange = (bmiStart && bmiEnd) ? bmiEnd - bmiStart : null;

  const wellnessStart = first?.wellness_score;
  const wellnessEnd = last?.wellness_score;
  const wellnessChange = (wellnessStart && wellnessEnd) ? wellnessEnd - wellnessStart : null;

  const sleepStart = first?.habits?.sleep_hours;
  const sleepEnd = last?.habits?.sleep_hours;
  const sleepImprovement = (sleepStart && sleepEnd) ? sleepEnd - sleepStart : null;

  const waterStart = first?.habits?.water_intake_liters;
  const waterEnd = last?.habits?.water_intake_liters;
  const waterImprovement = (waterStart && waterEnd) ? waterEnd - waterStart : null;

  // Activity increase (simplified - could be enhanced with workout data)
  const activityIncrease = wellnessChange ? Math.max(0, wellnessChange) : null;

  return {
    weightChange,
    bmiChange,
    wellnessScoreChange: wellnessChange,
    sleepImprovement,
    waterIntakeImprovement: waterImprovement,
    activityIncrease
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

// Generate weekly health summary
export const generateWeeklySummary = async (userId: string, referenceDate: Date = new Date()): Promise<HealthSummary> => {
  const weekStart = getStartOfWeek(referenceDate);
  const weekEnd = getEndOfWeek(referenceDate);

  const snapshots = await getProcessedMetricsByDateRange(userId, weekStart, weekEnd);

  const metrics = calculateMetrics(snapshots);
  const progress = calculateProgress(snapshots);
  const insights = generateInsights(metrics, progress);
  const recommendations = generateRecommendations(metrics, progress);

  return {
    period: 'weekly',
    startDate: weekStart,
    endDate: weekEnd,
    metrics,
    progress,
    keyInsights: insights,
    recommendations,
    generatedAt: new Date()
  };
};

// Generate monthly health summary
export const generateMonthlySummary = async (userId: string, referenceDate: Date = new Date()): Promise<HealthSummary> => {
  const monthStart = getStartOfMonth(referenceDate);
  const monthEnd = getEndOfMonth(referenceDate);

  const snapshots = await getProcessedMetricsByDateRange(userId, monthStart, monthEnd);

  const metrics = calculateMetrics(snapshots);
  const progress = calculateProgress(snapshots);
  const insights = generateInsights(metrics, progress);
  const recommendations = generateRecommendations(metrics, progress);

  return {
    period: 'monthly',
    startDate: monthStart,
    endDate: monthEnd,
    metrics,
    progress,
    keyInsights: insights,
    recommendations,
    generatedAt: new Date()
  };
};