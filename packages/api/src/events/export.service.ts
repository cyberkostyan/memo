import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";
import { Workbook } from "exceljs";
import type { ExportQueryDto } from "@memo/shared";

const MAX_EXPORT_ROWS = 10_000;

@Injectable()
export class ExportService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private sessionStore: SessionStoreService,
  ) {}

  private getDEK(userId: string): Uint8Array {
    const dek = this.sessionStore.get(userId);
    if (!dek) throw new UnauthorizedException("SESSION_ENCRYPTION_EXPIRED");
    return dek;
  }

  async generateXlsx(userId: string, query: ExportQueryDto): Promise<Buffer> {
    const dek = this.getDEK(userId);
    const where: any = { userId };

    if (query.categories) {
      const cats = query.categories.split(",").map((c) => c.trim());
      where.category = { in: cats };
    }
    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) where.timestamp.gte = new Date(query.from);
      if (query.to) where.timestamp.lte = new Date(query.to);
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: MAX_EXPORT_ROWS,
    });

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Events");

    // Header row
    sheet.columns = [
      { header: "Date & Time", key: "timestamp", width: 20 },
      { header: "Category", key: "category", width: 14 },
      { header: "Details", key: "details", width: 40 },
      { header: "Note", key: "note", width: 30 },
      { header: "AI Health Score", key: "rating", width: 14 },
    ];

    // Bold header + freeze
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Data rows
    for (const event of events) {
      const details = event.details
        ? JSON.parse(
            Buffer.from(this.encryption.decrypt(dek, event.details as Uint8Array)).toString("utf8"),
          )
        : null;
      const note = event.note
        ? Buffer.from(this.encryption.decrypt(dek, event.note as Uint8Array)).toString("utf8")
        : null;
      sheet.addRow({
        timestamp: new Date(event.timestamp),
        category: event.category,
        details: this.flattenDetails(details),
        note: note ?? "",
        rating: event.rating ?? "",
      });
    }

    // Format date column
    sheet.getColumn("timestamp").numFmt = "yyyy-mm-dd hh:mm";

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private flattenDetails(details: unknown): string {
    if (!details || typeof details !== "object") return "";
    return Object.entries(details as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
}
