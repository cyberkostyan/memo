import { Module } from "@nestjs/common";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { AnalysisCacheService } from "./analysis-cache.service";

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisCacheService],
  exports: [AnalysisCacheService],
})
export class AnalysisModule {}
