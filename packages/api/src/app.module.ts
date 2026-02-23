import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { UsersModule } from "./users/users.module";
import { PushModule } from "./push/push.module";
import { RemindersModule } from "./reminders/reminders.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { EncryptionModule } from "./encryption/encryption.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    EncryptionModule,
    AuthModule,
    EventsModule,
    UsersModule,
    PushModule,
    RemindersModule,
    PrivacyModule,
    AnalysisModule,
  ],
})
export class AppModule {}
