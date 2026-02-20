import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { RemindersService } from "./reminders.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { createReminderDto, updateReminderDto } from "@memo/shared";

@Controller("reminders")
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private reminders: RemindersService) {}

  @Post()
  create(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(createReminderDto)) body: unknown,
  ) {
    return this.reminders.create(userId, body as any);
  }

  @Get()
  findAll(@CurrentUser("id") userId: string) {
    return this.reminders.findAll(userId);
  }

  @Patch(":id")
  update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body(new ZodPipe(updateReminderDto)) body: unknown,
  ) {
    return this.reminders.update(userId, id, body as any);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.reminders.remove(userId, id);
  }
}
