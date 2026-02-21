import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisCacheService } from "./analysis-cache.service";
import { AuditLogService } from "../privacy/audit-log.service";
import { ANALYSIS_SYSTEM_PROMPT } from "./analysis.prompt";
import type { AnalysisRequestDto, AnalysisResult } from "@memo/shared";

interface EventEntry {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  tags: string[];
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private cache: AnalysisCacheService,
    private auditLog: AuditLogService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyze(
    userId: string,
    dto: AnalysisRequestDto,
    ipAddress?: string,
  ): Promise<AnalysisResult> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setHours(23, 59, 59, 999);
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - dto.period);
    periodStart.setHours(0, 0, 0, 0);

    // Check cache
    const cached = await this.cache.get(
      userId,
      periodStart,
      periodEnd,
      dto.focus,
    );
    if (cached) {
      this.logger.log(`Cache hit for user ${userId}, period ${dto.period}d`);
      return cached as unknown as AnalysisResult;
    }

    // Load events
    const events = await this.prisma.event.findMany({
      where: {
        userId,
        timestamp: { gte: periodStart, lte: periodEnd },
        ...(dto.focus ? { category: { in: dto.focus } } : {}),
      },
      orderBy: { timestamp: "asc" },
    });

    if (events.length === 0) {
      throw new NoDataError("No events found for the selected period");
    }

    // Transform events to spec format
    const entries: EventEntry[] = events.map((event) =>
      this.transformEvent(event),
    );

    // Build payload
    const payload = {
      locale: "ru",
      format: "json",
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      focus: dto.focus,
      entries,
    };

    // Call OpenAI
    this.logger.log(
      `Calling OpenAI for user ${userId}: ${entries.length} events, ${dto.period}d`,
    );

    const completion = await this.openai.chat.completions.create(
      {
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.3,
      },
      { timeout: 60000 },
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("Empty response from OpenAI");
    }

    const result = this.parseResponse(raw);

    // Cache result
    await this.cache.set(
      userId,
      periodStart,
      periodEnd,
      dto.focus,
      result as any,
    );

    // Audit log
    await this.auditLog.log({
      userId,
      action: "ai_analysis",
      resource: "analysis",
      details: {
        period: dto.period,
        focus: dto.focus,
        eventCount: entries.length,
      },
      ipAddress,
    });

    return result;
  }

  private transformEvent(event: {
    category: string;
    timestamp: Date;
    details: any;
    note: string | null;
    rating: number | null;
  }): EventEntry {
    const details = (event.details as Record<string, unknown>) ?? {};
    const data: Record<string, unknown> = {};

    switch (event.category) {
      case "sleep":
        data.duration_hours = details.hours ?? null;
        data.quality = details.quality ?? null;
        break;
      case "meal":
        data.description =
          [details.mealType, details.items].filter(Boolean).join(": ") ||
          event.note ||
          "";
        data.rating = event.rating ?? null;
        break;
      case "mood":
        data.score =
          event.rating ??
          (details.intensity
            ? (details.intensity as number) * 2
            : null);
        if (event.note) data.note = event.note;
        break;
      case "symptom":
        data.type = details.symptom ?? "";
        data.severity = details.severity ?? event.rating ?? null;
        if (details.location) data.location = details.location;
        break;
      case "medication":
        data.name = details.name ?? "";
        data.dose = details.dose ?? "";
        break;
      case "exercise":
        data.type = details.type ?? "";
        data.duration_min = details.duration ?? null;
        data.intensity = details.intensity ?? null;
        break;
      case "water":
        data.amount_ml = this.parseWaterAmount(details.amount as string);
        if (event.note) data.note = event.note;
        break;
      case "stool":
        data.bristol_type = details.bristolScale ?? null;
        break;
      case "note":
        data.text = event.note ?? "";
        break;
    }

    const tags: string[] = [];
    if (details.mealType) tags.push(details.mealType as string);
    if (details.emotion) tags.push(details.emotion as string);

    return {
      type: event.category,
      timestamp: event.timestamp.toISOString(),
      data,
      tags,
    };
  }

  private parseWaterAmount(amount?: string): number | null {
    if (!amount) return null;
    const match = amount.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private parseResponse(raw: string): AnalysisResult {
    let text = raw.trim();

    // Strip code fences if present
    if (text.startsWith("```")) {
      text = text.split("\n", 1)[1] ?? text;
      if (text.endsWith("```")) {
        text = text.slice(0, -3);
      }
      text = text.trim();
    }

    const result = JSON.parse(text);

    if (!result.analysis) {
      throw new Error("Invalid AI response: missing 'analysis' key");
    }
    if (!result.analysis.correlations) {
      throw new Error("Invalid AI response: missing 'correlations'");
    }

    return result as AnalysisResult;
  }
}

export class NoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoDataError";
  }
}
