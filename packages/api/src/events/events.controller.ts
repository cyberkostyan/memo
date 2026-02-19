import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { EventsService } from "./events.service";
import { ExportService } from "./export.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import {
  createEventDto,
  updateEventDto,
  eventQueryDto,
  exportQueryDto,
} from "@memo/shared";

@Controller("events")
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(
    private events: EventsService,
    private exportService: ExportService,
  ) {}

  @Post()
  create(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(createEventDto)) body: unknown,
  ) {
    return this.events.create(userId, body as any);
  }

  @Get()
  findAll(
    @CurrentUser("id") userId: string,
    @Query(new ZodPipe(eventQueryDto)) query: unknown,
  ) {
    return this.events.findAll(userId, query as any);
  }

  @Get("export")
  async export(
    @CurrentUser("id") userId: string,
    @Query(new ZodPipe(exportQueryDto)) query: unknown,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.generateXlsx(
      userId,
      query as any,
    );
    const date = new Date().toISOString().split("T")[0];
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="memo-export-${date}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get(":id")
  findOne(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.events.findOne(userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body(new ZodPipe(updateEventDto)) body: unknown,
  ) {
    return this.events.update(userId, id, body as any);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.events.remove(userId, id);
  }
}
