import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { UsersModule } from "./users/users.module";
import { PushModule } from "./push/push.module";
import { RemindersModule } from "./reminders/reminders.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    EventsModule,
    UsersModule,
    PushModule,
    RemindersModule,
  ],
})
export class AppModule {}
