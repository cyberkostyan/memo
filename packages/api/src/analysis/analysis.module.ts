import { Module } from "@nestjs/common";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { AnalysisCacheService } from "./analysis-cache.service";
import { DailyTipService } from "./daily-tip.service";

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisCacheService, DailyTipService],
  exports: [AnalysisCacheService],
})
export class AnalysisModule {}
