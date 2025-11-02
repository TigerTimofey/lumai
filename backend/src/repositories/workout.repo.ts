import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "../config/firebase.js";

const workoutsCollection = (userId: string) =>
  firestore().collection("users").doc(userId).collection("workouts");

export interface WorkoutDocument {
  createdAt?: Timestamp | Date | number | null;
  type?: string | null;
  durationMinutes?: number | null;
  weightKg?: number | null;
  sleepHours?: number | null;
  waterLiters?: number | null;
  stressLevel?: string | null;
  activityLevel?: string | null;
}

const resolveDate = (value: Timestamp | Date | number | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const resolved = new Date(value);
    return Number.isNaN(resolved.getTime()) ? null : resolved;
  }
  if (typeof value.toDate === "function") {
    const resolved = value.toDate();
    return Number.isNaN(resolved.getTime()) ? null : resolved;
  }
  return null;
};

export interface WorkoutEntry {
  createdAt: Date;
  type: string | null;
  durationMinutes: number | null;
  weightKg: number | null;
  sleepHours: number | null;
  waterLiters: number | null;
  stressLevel: string | null;
  activityLevel: string | null;
}

export const getWorkoutsByDateRange = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<WorkoutEntry[]> => {
  const startTimestamp = Timestamp.fromDate(startDate);
  const endTimestamp = Timestamp.fromDate(endDate);

  const snapshot = await workoutsCollection(userId)
    .where("createdAt", ">=", startTimestamp)
    .where("createdAt", "<=", endTimestamp)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs
    .map((docSnap) => docSnap.data() as WorkoutDocument)
    .map((workout) => {
      const createdAt = resolveDate(workout.createdAt);
      if (!createdAt) {
        return null;
      }
      return {
        createdAt,
        type: workout.type ?? null,
        durationMinutes:
          typeof workout.durationMinutes === "number" && Number.isFinite(workout.durationMinutes)
            ? workout.durationMinutes
            : null,
        weightKg:
          typeof workout.weightKg === "number" && Number.isFinite(workout.weightKg)
            ? workout.weightKg
            : null,
        sleepHours:
          typeof workout.sleepHours === "number" && Number.isFinite(workout.sleepHours)
            ? workout.sleepHours
            : null,
        waterLiters:
          typeof workout.waterLiters === "number" && Number.isFinite(workout.waterLiters)
            ? workout.waterLiters
            : null,
        stressLevel: typeof workout.stressLevel === "string" ? workout.stressLevel : null,
        activityLevel: typeof workout.activityLevel === "string" ? workout.activityLevel : null
      } satisfies WorkoutEntry;
    })
    .filter((entry): entry is WorkoutEntry => Boolean(entry));
};
