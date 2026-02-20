import { Module } from "@nestjs/common";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";
import { ReminderCronService } from "./reminder-cron.service";

@Module({
  controllers: [RemindersController],
  providers: [RemindersService, ReminderCronService],
  exports: [RemindersService],
})
export class RemindersModule {}
