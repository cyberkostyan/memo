import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { ExportService } from "./export.service";

@Module({
  controllers: [EventsController],
  providers: [EventsService, ExportService],
})
export class EventsModule {}
