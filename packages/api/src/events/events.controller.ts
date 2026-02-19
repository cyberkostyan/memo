import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { EventsService } from "./events.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { createEventDto, updateEventDto, eventQueryDto } from "@memo/shared";

@Controller("events")
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private events: EventsService) {}

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
