import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DeletionService } from "./deletion.service";
import { AuditLogService } from "./audit-log.service";
import { ConsentService } from "./consent.service";

@Injectable()
export class PrivacyCronService {
  private readonly logger = new Logger(PrivacyCronService.name);

  constructor(
    private deletion: DeletionService,
    private auditLog: AuditLogService,
    private consent: ConsentService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async executeDeletions() {
    const count = await this.deletion.executePendingDeletions();
    if (count > 0) {
      this.logger.log(`Executed ${count} pending account deletions`);
    }
  }

  @Cron("0 3 * * *")
  async cleanupAuditLogs() {
    const result = await this.auditLog.cleanup(2);
    this.logger.log(`Cleaned up ${result.count} audit log entries`);
  }

  @Cron("0 3 1 * *")
  async cleanupConsents() {
    const result = await this.consent.cleanupOldWithdrawn(5);
    this.logger.log(`Cleaned up ${result.count} old consent records`);
  }

  @Cron("0 4 * * *")
  async cleanupDeletionRequests() {
    const result = await this.deletion.cleanupCompleted(1);
    this.logger.log(`Cleaned up ${result.count} old deletion requests`);
  }
}
