import { Module, Global } from "@nestjs/common";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";
import { ConsentService } from "./consent.service";
import { AuditLogService } from "./audit-log.service";
import { DeletionService } from "./deletion.service";
import { PrivacyCronService } from "./privacy.cron";
import { AuditLogInterceptor } from "./audit-log.interceptor";

@Global()
@Module({
  controllers: [PrivacyController],
  providers: [
    PrivacyService,
    ConsentService,
    AuditLogService,
    DeletionService,
    PrivacyCronService,
    AuditLogInterceptor,
  ],
  exports: [ConsentService, AuditLogService],
})
export class PrivacyModule {}
