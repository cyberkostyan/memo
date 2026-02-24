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

  async getTip(userId: string): Promise<DailyTip | null> {
    // Primary path: extract tip from cached analysis
    try {
      const latest = await this.cacheService.getLatest(userId);
      if (latest) {
        const result = latest.result as AnalysisResult;
        const candidates = this.extractCandidates(result);
        if (candidates.length > 0) {
          const dayIndex = Math.floor(Date.now() / 86_400_000) % candidates.length;
          return candidates[dayIndex];
        }
      }
    } catch {
      // Encryption session expired or other error — fall through to heuristic
    }

    // Fallback path: heuristic based on today's event count
    return this.getHeuristicTip(userId);
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

  private async getHeuristicTip(userId: string): Promise<DailyTip> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = await this.prisma.event.count({
      where: { userId, timestamp: { gte: startOfDay } },
    });

    if (count === 0) {
      return {
        text: "Start tracking your day to get personalized health insights.",
        category: "note",
        source: "heuristic",
      };
    }

    const tips: DailyTip[] = [
      {
        text: `You've logged ${count} event${count > 1 ? "s" : ""} today. Keep it up to build meaningful patterns!`,
        category: "activity",
        source: "heuristic",
      },
      {
        text: "Consistent tracking helps AI spot trends. Try logging meals and mood together.",
        category: "meal",
        source: "heuristic",
      },
      {
        text: "Run your first AI analysis to get personalized recommendations.",
        category: "note",
        source: "heuristic",
      },
    ];

    const dayIndex = Math.floor(Date.now() / 86_400_000) % tips.length;
    return tips[dayIndex];
  }
}
