import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { UsersModule } from "./users/users.module";
import { PushModule } from "./push/push.module";
import { RemindersModule } from "./reminders/reminders.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { AuditLogInterceptor } from "./privacy/audit-log.interceptor";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    EventsModule,
    UsersModule,
    PushModule,
    RemindersModule,
    PrivacyModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useExisting: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
