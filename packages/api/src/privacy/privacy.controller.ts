import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Req,
  Res,
  UseGuards,
  Query,
} from "@nestjs/common";
import { Response, Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { updateConsentDto, deleteAccountDto } from "@memo/shared";
import { PrivacyService } from "./privacy.service";
import { ConsentService } from "./consent.service";
import { DeletionService } from "./deletion.service";
import { AuditLogService } from "./audit-log.service";

@Controller("privacy")
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(
    private privacy: PrivacyService,
    private consent: ConsentService,
    private deletion: DeletionService,
    private auditLog: AuditLogService,
  ) {}

  // --- Consents ---

  @Get("consents")
  getConsents(@CurrentUser("id") userId: string) {
    return this.consent.getCurrentConsents(userId);
  }

  @Post("consents")
  updateConsent(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(updateConsentDto)) body: unknown,
    @Req() req: Request,
  ) {
    const dto = body as any;
    return this.consent.updateConsent(
      userId,
      dto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Get("consents/history")
  getConsentHistory(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.consent.getConsentHistory(
      userId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // --- Data Export ---

  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Get("export")
  async exportData(
    @CurrentUser("id") userId: string,
    @Res() res: Response,
  ) {
    const data = await this.privacy.exportUserData(userId);
    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="memo-data-export-${date}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  }

  // --- Account Deletion ---

  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Post("delete-request")
  requestDeletion(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(deleteAccountDto)) body: unknown,
  ) {
    return this.deletion.requestDeletion(userId, body as any);
  }

  @Delete("delete-request")
  cancelDeletion(@CurrentUser("id") userId: string) {
    return this.deletion.cancelDeletion(userId);
  }

  @Get("delete-request")
  getDeletionStatus(@CurrentUser("id") userId: string) {
    return this.deletion.getStatus(userId);
  }

  // --- Audit Log ---

  @Get("audit-log")
  getAuditLog(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.auditLog.findByUser(
      userId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
