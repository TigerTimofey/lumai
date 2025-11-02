import type { GoalMilestone, GoalProgress } from "../domain/types.js";
import { getLatestProfileVersion } from "../repositories/profile.repo.js";
import { getUserById } from "../repositories/user.repo.js";
import { getProcessedMetricsByDateRange } from "../repositories/processed-metrics.repo.js";
import { getWorkoutsByDateRange } from "../repositories/workout.repo.js";

// Define milestone templates for different goal types
const WEIGHT_MILESTONES = {
  weight_loss: [
    { percentage: 10, title: "First 10% Progress", description: "You've lost 10% of your target weight!" },
    { percentage: 25, title: "Quarter Way There", description: "25% of your weight loss goal achieved!" },
    { percentage: 50, title: "Halfway Point", description: "You're halfway to your weight goal!" },
    { percentage: 75, title: "Three Quarters Done", description: "75% progress towards your target weight!" },
    { percentage: 100, title: "Goal Achieved!", description: "Congratulations! You've reached your weight goal!" }
  ],
  weight_gain: [
    { percentage: 10, title: "First 10% Progress", description: "You've gained 10% of your target weight!" },
    { percentage: 25, title: "Quarter Way There", description: "25% of your weight gain goal achieved!" },
    { percentage: 50, title: "Halfway Point", description: "You're halfway to your weight goal!" },
    { percentage: 75, title: "Three Quarters Done", description: "75% progress towards your target weight!" },
    { percentage: 100, title: "Goal Achieved!", description: "Congratulations! You've reached your weight goal!" }
  ],
  muscle_gain: [
    { percentage: 10, title: "Building Foundations", description: "10% progress towards muscle gain goal!" },
    { percentage: 25, title: "Strength Building", description: "25% towards your muscle building goal!" },
    { percentage: 50, title: "Halfway Stronger", description: "You're halfway to your muscle gain target!" },
    { percentage: 75, title: "Power Progress", description: "75% progress - you're getting stronger!" },
    { percentage: 100, title: "Muscle Goal Complete!", description: "Congratulations on achieving your muscle gain goal!" }
  ]
};

const ACTIVITY_MILESTONES = [
  { sessions: 10, title: "Getting Started", description: "Completed 10 workout sessions!" },
  { sessions: 25, title: "Building Momentum", description: "25 workouts completed - you're consistent!" },
  { sessions: 50, title: "Half Century Club", description: "50 workouts done - impressive dedication!" },
  { sessions: 100, title: "Century Mark", description: "100 workouts completed - you're unstoppable!" },
  { sessions: 200, title: "Double Century", description: "200 workouts - elite level commitment!" }
];

const HABIT_MILESTONES = {
  sleep: [
    { target: 6, title: "Sleep Foundation", description: "Achieved 6 hours of sleep per night!" },
    { target: 7, title: "Good Sleep Habit", description: "Consistently getting 7 hours of sleep!" },
    { target: 8, title: "Excellent Rest", description: "8 hours of quality sleep per night!" },
    { target: 9, title: "Sleep Champion", description: "9+ hours of sleep - optimal recovery!" }
  ],
  water: [
    { target: 1.5, title: "Hydration Starter", description: "Drinking 1.5L of water daily!" },
    { target: 2.0, title: "Well Hydrated", description: "2L of water intake per day!" },
    { target: 2.5, title: "Hydration Hero", description: "2.5L of water - staying optimally hydrated!" },
    { target: 3.0, title: "Hydration Champion", description: "3L+ of water daily - hydration master!" }
  ],
  consistency: [
    { days: 7, title: "Week Warrior", description: "7 consecutive days of healthy habits!" },
    { days: 14, title: "Two Week Streak", description: "14 days of consistent healthy living!" },
    { days: 30, title: "Monthly Master", description: "30 consecutive days of healthy habits!" },
    { days: 60, title: "Two Month Champion", description: "60 days of unwavering commitment!" },
    { days: 90, title: "Quarter Century", description: "90 consecutive days - habit mastery!" }
  ]
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HABIT_LOOKBACK_DAYS = 90;
const ACTIVITY_HISTORY_DAYS = 365;

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

// Calculate weight milestone progress
function calculateWeightMilestones(
  startingWeight: number,
  currentWeight: number,
  targetWeight: number,
  primaryGoal: string
): GoalMilestone[] {
  const milestones: GoalMilestone[] = [];
  const isWeightLoss = primaryGoal === "weight_loss";
  const totalChange = Math.abs(targetWeight - startingWeight);
  let progressPercentage: number;

  if (totalChange <= 0) {
    progressPercentage = 100;
  } else {
    const currentChange = isWeightLoss
      ? Math.max(0, startingWeight - currentWeight)
      : Math.max(0, currentWeight - startingWeight);
    progressPercentage = (currentChange / totalChange) * 100;
  }

  const boundedCurrent = Math.max(0, Math.min(progressPercentage, 100));

  const milestoneTemplates = WEIGHT_MILESTONES[primaryGoal as keyof typeof WEIGHT_MILESTONES] || [];

  milestoneTemplates.forEach((template, index) => {
    const milestoneProgress = Math.min(boundedCurrent, template.percentage);
    const achieved = boundedCurrent >= template.percentage;

    milestones.push({
      id: `weight-${index}`,
      type: 'weight',
      title: template.title,
      description: template.description,
      targetValue: template.percentage,
      currentValue: boundedCurrent,
      unit: '%',
      progress: milestoneProgress,
      achieved,
      category: 'Weight Goal'
    });
  });

  return milestones;
}

// Calculate activity milestone progress
function calculateActivityMilestones(totalWorkouts: number): GoalMilestone[] {
  const milestones: GoalMilestone[] = [];

  ACTIVITY_MILESTONES.forEach((template, index) => {
    const progress = Math.min(totalWorkouts, template.sessions);
    const achieved = totalWorkouts >= template.sessions;

    milestones.push({
      id: `activity-${index}`,
      type: 'activity',
      title: template.title,
      description: template.description,
      targetValue: template.sessions,
      currentValue: totalWorkouts,
      unit: 'sessions',
      progress: (progress / template.sessions) * 100,
      achieved,
      category: 'Activity Goal'
    });
  });

  return milestones;
}

// Calculate habit milestone progress
function calculateHabitMilestones(
  avgSleepHours: number | null,
  avgWaterLiters: number | null,
  consistencyScore: number
): GoalMilestone[] {
  const milestones: GoalMilestone[] = [];

  // Sleep milestones
  if (avgSleepHours !== null) {
    HABIT_MILESTONES.sleep.forEach((template, index) => {
      const achieved = avgSleepHours >= template.target;
      milestones.push({
        id: `sleep-${index}`,
        type: 'habit',
        title: template.title,
        description: template.description,
        targetValue: template.target,
        currentValue: avgSleepHours,
        unit: 'hours',
        progress: Math.min((avgSleepHours / template.target) * 100, 100),
        achieved,
        category: 'Sleep Habit'
      });
    });
  }

  // Water milestones
  if (avgWaterLiters !== null) {
    HABIT_MILESTONES.water.forEach((template, index) => {
      const achieved = avgWaterLiters >= template.target;
      milestones.push({
        id: `water-${index}`,
        type: 'habit',
        title: template.title,
        description: template.description,
        targetValue: template.target,
        currentValue: avgWaterLiters,
        unit: 'liters',
        progress: Math.min((avgWaterLiters / template.target) * 100, 100),
        achieved,
        category: 'Hydration Habit'
      });
    });
  }

  // Consistency milestones
  HABIT_MILESTONES.consistency.forEach((template, index) => {
    const achieved = consistencyScore >= 80; // Assuming consistency score represents streak
    milestones.push({
      id: `consistency-${index}`,
      type: 'habit',
      title: template.title,
      description: template.description,
      targetValue: template.days,
      currentValue: Math.round((consistencyScore / 100) * template.days),
      unit: 'days',
      progress: consistencyScore,
      achieved,
      category: 'Consistency Habit'
    });
  });

  return milestones;
}

// Main function to generate goal progress with milestones
export async function generateGoalProgress(userId: string): Promise<GoalProgress | null> {
  try {
    const [profile, userDoc] = await Promise.all([
      getLatestProfileVersion(userId),
      getUserById(userId)
    ]);

    const now = new Date();
    const habitWindowStart = new Date(now.getTime() - HABIT_LOOKBACK_DAYS * DAY_IN_MS);
    const historyStart = new Date(now.getTime() - ACTIVITY_HISTORY_DAYS * DAY_IN_MS);

    const processedHistory = await getProcessedMetricsByDateRange(userId, historyStart, now);
    const workoutsHistory = await getWorkoutsByDateRange(userId, historyStart, now);

    const weightEntries: Array<{ date: Date; value: number }> = [];
    const entryDays = new Set<string>();
    const sleepSamples: number[] = [];
    const waterSamples: number[] = [];

    processedHistory.forEach((snapshot) => {
      const metrics = snapshot.userMetrics as Record<string, unknown> | undefined;
      if (!metrics) return;
      const current = (metrics.current_state ?? {}) as Record<string, unknown>;
      const normalized = (metrics.normalized ?? current.normalized ?? {}) as Record<string, unknown>;
      const habits = (metrics.habits ?? {}) as Record<string, unknown>;

      const weight =
        toNumber(current.weight_kg) ??
        toNumber(current.weightKg) ??
        toNumber(normalized.weightKg ?? normalized.weight_kg);

      const date = snapshot.createdAt.toDate();
      if (weight != null) {
        weightEntries.push({ date, value: weight });
      }

      if (date.getTime() >= habitWindowStart.getTime()) {
        entryDays.add(date.toISOString().slice(0, 10));

        const sleep = toNumber(habits.sleep_hours ?? habits.sleepHours);
        if (sleep != null) sleepSamples.push(sleep);

        const water = toNumber(habits.water_intake_liters ?? habits.waterIntakeLiters);
        if (water != null) waterSamples.push(water);
      }
    });

    workoutsHistory.forEach((workout) => {
      if (workout.weightKg != null) {
        weightEntries.push({ date: workout.createdAt, value: workout.weightKg });
      }
      if (workout.createdAt.getTime() >= habitWindowStart.getTime()) {
        entryDays.add(workout.createdAt.toISOString().slice(0, 10));
        if (workout.sleepHours != null) sleepSamples.push(workout.sleepHours);
        if (workout.waterLiters != null) waterSamples.push(workout.waterLiters);
      }
    });

    weightEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

    const profileRequired = (userDoc?.requiredProfile ?? {}) as Record<string, unknown>;
    const normalizedProfile = profile?.normalized ?? null;
    const profileGoals = profile?.goals;
    const rawPrimaryGoal =
      (typeof profileGoals?.primaryGoal === "string" ? profileGoals.primaryGoal : null) ??
      (typeof profileRequired.fitnessGoal === "string" ? String(profileRequired.fitnessGoal) : null);
    const primaryGoal = rawPrimaryGoal ?? "general_fitness";

    const rawTargetWeightCandidate =
      (typeof profileGoals?.targetWeightKg === "number" ? profileGoals.targetWeightKg : null) ??
      toNumber(
        (profileRequired as Record<string, unknown>).targetWeightKg ??
          (profileRequired as Record<string, unknown>).targetWeight
      );
    const targetWeight =
      typeof rawTargetWeightCandidate === "number" && Number.isFinite(rawTargetWeightCandidate)
        ? rawTargetWeightCandidate
        : null;

    let startingWeight =
      (weightEntries.length > 0 ? weightEntries[0].value : null) ??
      toNumber(profileRequired.weight) ??
      (normalizedProfile?.weightKg ?? null);

    const latestProfileWeight =
      normalizedProfile?.weightKg ??
      toNumber(profileRequired.weight);

    let currentWeight =
      (weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].value : null) ??
      latestProfileWeight ??
      startingWeight ??
      null;

    if (startingWeight == null) {
      startingWeight = currentWeight;
    }

    const avgSleepHours =
      sleepSamples.length > 0
        ? sleepSamples.reduce((sum, value) => sum + value, 0) / sleepSamples.length
        : null;

    const avgWaterLiters =
      waterSamples.length > 0
        ? waterSamples.reduce((sum, value) => sum + value, 0) / waterSamples.length
        : null;

    const windowDays = Math.max(
      Math.round((now.getTime() - habitWindowStart.getTime()) / DAY_IN_MS) + 1,
      1
    );
    const consistencyScore = Math.min(
      100,
      Math.round((entryDays.size / Math.max(windowDays, 1)) * 100)
    );

    const totalWorkouts = workoutsHistory.length;

    const allMilestones: GoalMilestone[] = [];
    if (
      targetWeight != null &&
      startingWeight != null &&
      currentWeight != null &&
      Number.isFinite(startingWeight) &&
      Number.isFinite(currentWeight)
    ) {
      const weightMilestones = calculateWeightMilestones(
        startingWeight,
        currentWeight,
        targetWeight,
        primaryGoal
      );
      allMilestones.push(...weightMilestones);
    }

    const activityMilestones = calculateActivityMilestones(totalWorkouts);
    allMilestones.push(...activityMilestones);

    if (avgSleepHours !== null || avgWaterLiters !== null || consistencyScore > 0) {
      const habitMilestones = calculateHabitMilestones(
        avgSleepHours,
        avgWaterLiters,
        consistencyScore
      );
      allMilestones.push(...habitMilestones);
    }

    const completedMilestones = allMilestones.filter((m) => m.achieved).length;
    const totalMilestones = allMilestones.length;
    const overallProgress =
      totalMilestones > 0
        ? allMilestones.reduce((sum, milestone) => sum + milestone.progress, 0) /
          totalMilestones
        : 0;

    return {
      primaryGoal,
      milestones: allMilestones,
      overallProgress: Math.min(Math.max(overallProgress, 0), 100),
      completedMilestones,
      totalMilestones
    };

  } catch (error) {
    console.error('Failed to generate goal progress:', error);
    return null;
  }
}
