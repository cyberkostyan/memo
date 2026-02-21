import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { ConsentService } from "../privacy/consent.service";
import { AnalysisService, NoDataError } from "./analysis.service";
import { analysisRequestDto } from "@memo/shared";

@Controller("analysis")
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(
    private analysisService: AnalysisService,
    private consentService: ConsentService,
  ) {}

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
      this.logger.error(`Analysis failed for user ${userId}`, err);
      throw new InternalServerErrorException({
        error: "ANALYSIS_FAILED",
        message: "Failed to analyze data. Please try again later.",
      });
    }
  }
}
