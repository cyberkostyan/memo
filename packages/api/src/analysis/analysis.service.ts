import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisCacheService } from "./analysis-cache.service";
import { AuditLogService } from "../privacy/audit-log.service";
import { ANALYSIS_SYSTEM_PROMPT } from "./analysis.prompt";
import type { AnalysisRequestDto, AnalysisResult } from "@memo/shared";

interface EventEntry {
  id: string;
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

    const eventsToRate = this.getEventsToRate(events);

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
      events_to_rate: eventsToRate,
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

    // Extract and apply event ratings
    const rawParsed = JSON.parse(raw.trim());
    const eventRatings = this.extractRatings(rawParsed, eventsToRate);
    if (eventRatings.length > 0) {
      await this.applyRatings(eventRatings);
    }

    // Attach metadata
    result.meta = {
      analyzedAt: new Date().toISOString(),
      entryCount: entries.length,
    };

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
    id: string;
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
        data.description = this.sanitizeText(
          [details.mealType, details.items].filter(Boolean).join(": ") ||
            event.note ||
            "",
          200,
        );
        data.rating = event.rating ?? null;
        break;
      case "mood":
        data.score =
          event.rating ??
          (details.intensity
            ? (details.intensity as number) * 2
            : null);
        if (event.note) data.note = this.sanitizeText(event.note);
        break;
      case "symptom":
        data.type = this.sanitizeText(String(details.symptom ?? ""), 100);
        data.severity = details.severity ?? event.rating ?? null;
        if (details.location)
          data.location = this.sanitizeText(String(details.location), 100);
        break;
      case "medication":
        data.name = this.sanitizeText(String(details.name ?? ""), 100);
        data.dose = this.sanitizeText(String(details.dose ?? ""), 50);
        break;
      case "activity":
        data.type = this.sanitizeText(String(details.type ?? ""), 100);
        data.duration_min = details.duration ?? null;
        data.intensity = details.intensity ?? null;
        break;
      case "water":
        data.amount_ml = this.parseWaterAmount(details.amount as string);
        if (event.note) data.note = this.sanitizeText(event.note, 200);
        break;
      case "toilet":
        data.sub_type = details.subType ?? "stool";
        if (details.subType === "urine") {
          data.urine_color = details.urineColor ?? null;
          data.volume = details.volume ?? null;
          data.urgency = details.urgency ?? null;
        } else {
          data.bristol_type = details.bristolScale ?? null;
        }
        break;
      case "note":
        data.text = this.sanitizeText(event.note ?? "");
        break;
    }

    const tags: string[] = [];
    if (details.mealType) tags.push(String(details.mealType).slice(0, 50));
    if (details.emotion) tags.push(String(details.emotion).slice(0, 50));

    return {
      id: event.id,
      type: event.category,
      timestamp: event.timestamp.toISOString(),
      data,
      tags,
    };
  }

  /** Truncate and sanitize free-text fields to limit prompt injection surface */
  private sanitizeText(text: string, maxLength = 500): string {
    return text.slice(0, maxLength).replace(/\r/g, "");
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
    delete result.event_ratings;
    return this.validateResponse(result);
  }

  private validateResponse(data: unknown): AnalysisResult {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid AI response: not an object");
    }

    const root = data as Record<string, unknown>;
    if (!root.analysis || typeof root.analysis !== "object") {
      throw new Error("Invalid AI response: missing 'analysis' key");
    }

    const a = root.analysis as Record<string, unknown>;

    // Period
    if (!a.period || typeof a.period !== "object") {
      throw new Error("Invalid AI response: missing 'period'");
    }

    // Health score
    if (!a.health_score || typeof a.health_score !== "object") {
      throw new Error("Invalid AI response: missing 'health_score'");
    }
    const hs = a.health_score as Record<string, unknown>;
    hs.value = this.clampNumber(hs.value, 0, 100);
    if (typeof hs.trend === "string") {
      hs.trend = this.validateEnum(hs.trend, ["improving", "stable", "declining"], "stable");
    }
    if (hs.components && typeof hs.components === "object") {
      const comp = hs.components as Record<string, unknown>;
      for (const key of ["sleep", "nutrition", "activity", "digestion", "mood"]) {
        comp[key] = this.clampNumber(comp[key], 0, 100);
      }
    }

    // Required arrays — validate and sanitize each
    a.correlations = this.validateArray(a.correlations, (c: Record<string, unknown>) => {
      c.strength = this.validateEnum(c.strength, ["strong", "moderate", "weak"], "weak");
      c.confidence = this.validateEnum(c.confidence, ["high", "medium", "low"], "low");
      c.direction = this.validateEnum(c.direction, ["positive", "negative"], "positive");
      c.data_points = this.clampNumber(c.data_points, 0, 10000);
      return c;
    });

    a.trends = this.validateArray(a.trends, (t: Record<string, unknown>) => {
      t.direction = this.validateEnum(
        t.direction,
        ["improving", "declining", "stable", "cyclical"],
        "stable",
      );
      return t;
    });

    a.anomalies = this.validateArray(a.anomalies, (an: Record<string, unknown>) => {
      an.severity = this.validateEnum(an.severity, ["info", "warning", "alert"], "info");
      return an;
    });

    a.recommendations = this.validateArray(a.recommendations, (r: Record<string, unknown>) => {
      r.priority = this.validateEnum(r.priority, ["high", "medium", "low"], "medium");
      return r;
    });

    a.data_gaps = this.validateArray(a.data_gaps, (g: Record<string, unknown>) => {
      g.issue = this.validateEnum(g.issue, ["missing", "insufficient", "irregular"], "missing");
      return g;
    });

    // Ensure summary is a string
    if (typeof a.summary !== "string") {
      a.summary = "";
    }

    return { analysis: a } as unknown as AnalysisResult;
  }

  private clampNumber(val: unknown, min: number, max: number): number {
    const n = typeof val === "number" ? val : 0;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  private validateEnum<T extends string>(val: unknown, allowed: T[], fallback: T): T {
    return typeof val === "string" && (allowed as string[]).includes(val)
      ? (val as T)
      : fallback;
  }

  private validateArray<T>(
    val: unknown,
    sanitize: (item: Record<string, unknown>) => T,
  ): T[] {
    if (!Array.isArray(val)) return [];
    return val
      .filter((item) => item && typeof item === "object")
      .map((item) => sanitize(item as Record<string, unknown>));
  }

  private getEventsToRate(events: Array<{
    id: string;
    rating: number | null;
    ratedAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
    timestamp: Date;
  }>): string[] {
    const idsToRate: string[] = [];
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    for (const event of events) {
      // Rule 1: Never rated
      if (event.rating == null) {
        idsToRate.push(event.id);
        continue;
      }

      // Rule 2: Event edited after last rating
      if (event.ratedAt && event.updatedAt > event.ratedAt) {
        idsToRate.push(event.id);
        continue;
      }

      // Rule 3: New contextual events appeared nearby (±2 hours)
      if (event.ratedAt) {
        const hasNewNeighbor = events.some(
          (other) =>
            other.id !== event.id &&
            other.createdAt > event.ratedAt! &&
            Math.abs(other.timestamp.getTime() - event.timestamp.getTime()) <= TWO_HOURS_MS,
        );
        if (hasNewNeighbor) {
          idsToRate.push(event.id);
        }
      }
    }

    return idsToRate;
  }

  private extractRatings(
    parsed: Record<string, unknown>,
    validIds: string[],
  ): Array<{ id: string; score: number }> {
    const ratings = parsed.event_ratings;
    if (!Array.isArray(ratings)) {
      if (ratings !== undefined) {
        this.logger.warn("AI response missing or invalid event_ratings field");
      }
      return [];
    }

    const validIdSet = new Set(validIds);
    return ratings
      .filter((r: any) => {
        if (!r || typeof r !== "object") return false;
        if (typeof r.id !== "string" || !validIdSet.has(r.id)) return false;
        if (typeof r.score !== "number" || r.score < 0 || r.score > 10) return false;
        return true;
      })
      .map((r: any) => ({ id: r.id as string, score: Math.round(r.score) }));
  }

  private async applyRatings(ratings: Array<{ id: string; score: number }>): Promise<void> {
    const now = new Date();
    try {
      await this.prisma.$transaction(
        ratings.map((r) =>
          this.prisma.event.update({
            where: { id: r.id },
            data: { rating: r.score, ratedAt: now },
          }),
        ),
      );
      this.logger.log(`Applied AI ratings to ${ratings.length} events`);
    } catch (error) {
      this.logger.error("Failed to apply AI ratings", error);
    }
  }
}

export class NoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoDataError";
  }
}
