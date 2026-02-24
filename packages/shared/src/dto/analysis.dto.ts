import { z } from "zod";
import { EVENT_CATEGORIES } from "../event-types";

// Request DTO
export const analysisRequestDto = z.object({
  period: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]),
  focus: z.array(z.enum(EVENT_CATEGORIES)).nullable().default(null),
});

export type AnalysisRequestDto = z.infer<typeof analysisRequestDto>;

// Response types (from AI)

export interface AnalysisHealthScore {
  value: number;
  trend: "improving" | "stable" | "declining";
  components: {
    sleep: number;
    nutrition: number;
    activity: number;
    digestion: number;
    mood: number;
  };
}

export interface AnalysisCorrelation {
  id: string;
  factor_a: { category: string; metric: string };
  factor_b: { category: string; metric: string };
  direction: "positive" | "negative";
  strength: "strong" | "moderate" | "weak";
  confidence: "high" | "medium" | "low";
  data_points: number;
  description: string;
  example: string;
}

export interface AnalysisTrend {
  id: string;
  category: string;
  metric: string;
  direction: "improving" | "declining" | "stable" | "cyclical";
  period_days: number;
  description: string;
  data_points: Array<{ date: string; value: number }>;
}

export interface AnalysisAnomaly {
  id: string;
  date: string;
  category: string;
  description: string;
  severity: "info" | "warning" | "alert";
  possible_causes: string[];
}

export interface AnalysisRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  based_on: string[];
  actionable: boolean;
}

export interface AnalysisDataGap {
  category: string;
  issue: "missing" | "insufficient" | "irregular";
  suggestion: string;
}

export interface AnalysisLabValue {
  name: string;
  value: number;
  unit: string;
  reference_range: string;
  status: "normal" | "high" | "low";
}

export interface AnalysisLabResult {
  source_event_id: string;
  date: string;
  source_type: "image" | "pdf";
  test_name: string;
  values: AnalysisLabValue[];
  notes: string | null;
}

export interface AnalysisMeta {
  analyzedAt: string;
  entryCount: number;
}

export interface AnalysisResult {
  analysis: {
    period: {
      start: string;
      end: string;
      total_days: number;
    };
    summary: string;
    health_score: AnalysisHealthScore;
    correlations: AnalysisCorrelation[];
    trends: AnalysisTrend[];
    anomalies: AnalysisAnomaly[];
    recommendations: AnalysisRecommendation[];
    data_gaps: AnalysisDataGap[];
    lab_results: AnalysisLabResult[];
  };
  meta: AnalysisMeta;
}

export interface DailyTip {
  text: string;
  category: string;
  source: "analysis" | "heuristic";
}

export interface AnalysisHistoryItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  healthScore: number | null;
  trend: "improving" | "stable" | "declining" | null;
  summary: string | null;
  entryCount: number | null;
}
