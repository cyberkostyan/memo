import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { ExportService } from "./export.service";
import { AttachmentService } from "./attachment.service";
import { AnalysisModule } from "../analysis/analysis.module";

@Module({
  imports: [AnalysisModule],
  controllers: [EventsController],
  providers: [EventsService, ExportService, AttachmentService],
})
export class EventsModule {}
