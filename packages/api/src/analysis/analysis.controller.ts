import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { ConsentService } from "../privacy/consent.service";
import { AnalysisService, NoDataError } from "./analysis.service";
import { AnalysisCacheService } from "./analysis-cache.service";
import { DailyTipService } from "./daily-tip.service";
import { analysisRequestDto } from "@memo/shared";

@Controller("analysis")
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(
    private analysisService: AnalysisService,
    private consentService: ConsentService,
    private cacheService: AnalysisCacheService,
    private dailyTipService: DailyTipService,
  ) {}

  @Get("latest")
  async getLatest(@CurrentUser("id") userId: string) {
    const latest = await this.cacheService.getLatest(userId);
    if (!latest) return { cached: false };
    return {
      cached: true,
      ...(latest.result as Record<string, unknown>),
      cachedAt: latest.createdAt,
    };
  }

  @Get("history")
  async getHistory(@CurrentUser("id") userId: string) {
    return this.cacheService.getHistory(userId);
  }

  @Get("daily-tip")
  async getDailyTip(@CurrentUser("id") userId: string) {
    const tip = await this.dailyTipService.getTip(userId);
    if (!tip) return { tip: null };
    return { tip };
  }

  @Get(":id")
  async getById(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
  ) {
    const entry = await this.cacheService.getById(id, userId);
    if (!entry) throw new NotFoundException("Analysis not found");
    return {
      ...(entry.result as Record<string, unknown>),
      cachedAt: entry.createdAt,
    };
  }

  @Post()
  async analyze(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(analysisRequestDto)) body: unknown,
    @Req() req: Request,
  ) {
    // Check ai_data_sharing consent
    const consents = await this.consentService.getCurrentConsents(userId);
    const aiConsent = consents.find((c) => c.type === "ai_data_sharing");
    if (!aiConsent || !aiConsent.granted) {
      throw new ForbiddenException({
        error: "AI_CONSENT_REQUIRED",
        message:
          "You need to enable AI Data Analysis in Privacy Settings before using this feature.",
      });
    }

    try {
      return await this.analysisService.analyze(userId, body as any, req.ip);
    } catch (err) {
      if (err instanceof NoDataError) {
        throw new BadRequestException({
          error: "NO_DATA",
          message: err.message,
        });
      }
      if (
        err instanceof UnauthorizedException ||
        (err as any)?.status === 401
      ) {
        throw err;
      }
      this.logger.error(`Analysis failed for user ${userId}`, err);
      throw new InternalServerErrorException({
        error: "ANALYSIS_FAILED",
        message: "Failed to analyze data. Please try again later.",
      });
    }
  }
}
