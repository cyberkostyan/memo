import { z } from "zod";

export const EVENT_CATEGORIES = [
  "meal",
  "stool",
  "mood",
  "symptom",
  "medication",
  "exercise",
  "water",
  "sleep",
  "note",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_CONFIG: Record<
  EventCategory,
  { label: string; icon: string; color: string }
> = {
  meal: { label: "Meal", icon: "🍽️", color: "#F59E0B" },
  stool: { label: "Stool", icon: "💩", color: "#92400E" },
  mood: { label: "Mood", icon: "😊", color: "#EC4899" },
  symptom: { label: "Symptom", icon: "🤒", color: "#EF4444" },
  medication: { label: "Medication", icon: "💊", color: "#3B82F6" },
  exercise: { label: "Exercise", icon: "🏃", color: "#10B981" },
  water: { label: "Water", icon: "💧", color: "#06B6D4" },
  sleep: { label: "Sleep", icon: "😴", color: "#6366F1" },
  note: { label: "Note", icon: "📝", color: "#6B7280" },
};

// Zod schemas for category-specific details

export const mealDetailsSchema = z.object({
  items: z.string().optional(),
  amount: z.string().optional(),
  mealType: z
    .enum(["breakfast", "lunch", "dinner", "snack"])
    .optional(),
});

export const stoolDetailsSchema = z.object({
  bristolScale: z.number().int().min(1).max(7).optional(),
  color: z.string().optional(),
});

export const moodDetailsSchema = z.object({
  emotion: z.string().optional(),
  intensity: z.number().int().min(1).max(5).optional(),
});

export const symptomDetailsSchema = z.object({
  symptom: z.string().optional(),
  severity: z.number().int().min(1).max(10).optional(),
  location: z.string().optional(),
});

export const medicationDetailsSchema = z.object({
  name: z.string().optional(),
  dose: z.string().optional(),
});

export const exerciseDetailsSchema = z.object({
  type: z.string().optional(),
  duration: z.number().optional(),
  intensity: z.string().optional(),
});

export const waterDetailsSchema = z.object({
  amount: z.string().optional(),
});

export const sleepDetailsSchema = z.object({
  hours: z.number().optional(),
  quality: z.number().int().min(1).max(5).optional(),
});

export const noteDetailsSchema = z.object({});

export const detailsSchemas: Record<EventCategory, z.ZodType> = {
  meal: mealDetailsSchema,
  stool: stoolDetailsSchema,
  mood: moodDetailsSchema,
  symptom: symptomDetailsSchema,
  medication: medicationDetailsSchema,
  exercise: exerciseDetailsSchema,
  water: waterDetailsSchema,
  sleep: sleepDetailsSchema,
  note: noteDetailsSchema,
};

// Inferred types
export type MealDetails = z.infer<typeof mealDetailsSchema>;
export type StoolDetails = z.infer<typeof stoolDetailsSchema>;
export type MoodDetails = z.infer<typeof moodDetailsSchema>;
export type SymptomDetails = z.infer<typeof symptomDetailsSchema>;
export type MedicationDetails = z.infer<typeof medicationDetailsSchema>;
export type ExerciseDetails = z.infer<typeof exerciseDetailsSchema>;
export type WaterDetails = z.infer<typeof waterDetailsSchema>;
export type SleepDetails = z.infer<typeof sleepDetailsSchema>;

export type EventDetails =
  | MealDetails
  | StoolDetails
  | MoodDetails
  | SymptomDetails
  | MedicationDetails
  | ExerciseDetails
  | WaterDetails
  | SleepDetails;
