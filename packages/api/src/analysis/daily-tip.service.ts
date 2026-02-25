import { Injectable, Logger } from "@nestjs/common";
import type { DailyTip, AnalysisResult } from "@memo/shared";
import { AnalysisCacheService } from "./analysis-cache.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DailyTipService {
  private readonly logger = new Logger(DailyTipService.name);

  constructor(
    private cacheService: AnalysisCacheService,
    private prisma: PrismaService,
  ) {}

  async getTips(userId: string): Promise<DailyTip[]> {
    // Primary path: extract tips from cached analysis
    try {
      const latest = await this.cacheService.getLatest(userId);
      if (latest) {
        const result = latest.result as AnalysisResult;
        const candidates = this.extractCandidates(result);
        if (candidates.length > 0) return candidates;
      }
    } catch {
      // Encryption session expired or other error — fall through to heuristic
    }

    // Fallback path: heuristic based on today's categories
    return this.getHeuristicTips(userId);
  }

  private extractCandidates(result: AnalysisResult): DailyTip[] {
    const candidates: DailyTip[] = [];
    const analysis = result?.analysis;
    if (!analysis) return candidates;

    if (Array.isArray(analysis.recommendations)) {
      for (const rec of analysis.recommendations) {
        candidates.push({
          text: `${rec.title}: ${rec.description}`,
          category: rec.category ?? "note",
          source: "analysis",
        });
      }
    }

    if (Array.isArray(analysis.trends)) {
      for (const trend of analysis.trends) {
        candidates.push({
          text: trend.description,
          category: trend.category ?? "note",
          source: "analysis",
        });
      }
    }

    return candidates;
  }

  private async getHeuristicTips(userId: string): Promise<DailyTip[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const events = await this.prisma.event.groupBy({
      by: ["category"],
      where: { userId, timestamp: { gte: startOfDay } },
      _count: true,
    });

    const logged = new Set(events.map((e) => e.category));

    if (logged.size === 0) {
      return [
        { text: "Start your day with a glass of water — aim for 8 glasses today.", category: "water", source: "heuristic" },
        { text: "Try a 30-minute walk today to boost your energy and mood.", category: "activity", source: "heuristic" },
        { text: "Track your first meal to start building nutrition insights.", category: "meal", source: "heuristic" },
      ];
    }

    const tips: DailyTip[] = [];

    if (!logged.has("water")) {
      tips.push({ text: "Don't forget to stay hydrated — log your water intake today.", category: "water", source: "heuristic" });
    }
    if (!logged.has("activity")) {
      tips.push({ text: "Try to fit in at least 30 minutes of activity today.", category: "activity", source: "heuristic" });
    }
    if (!logged.has("sleep")) {
      tips.push({ text: "Log last night's sleep to help track your rest patterns.", category: "sleep", source: "heuristic" });
    }
    if (!logged.has("mood")) {
      tips.push({ text: "Take a moment to check in — how are you feeling right now?", category: "mood", source: "heuristic" });
    }
    if (logged.has("symptom") && !logged.has("meal")) {
      tips.push({ text: "You logged a symptom today — tracking meals can help find correlations.", category: "meal", source: "heuristic" });
    }
    if (logged.has("meal") && !logged.has("water")) {
      tips.push({ text: "You've eaten but haven't logged water — try drinking a glass between meals.", category: "water", source: "heuristic" });
    }
    if (logged.has("medication") && !logged.has("mood")) {
      tips.push({ text: "Track your mood alongside medication to see how it affects you.", category: "mood", source: "heuristic" });
    }

    if (tips.length === 0) {
      tips.push({ text: "Great tracking today! Run an AI analysis to get personalized insights.", category: "note", source: "heuristic" });
    }

    return tips;
  }
}
