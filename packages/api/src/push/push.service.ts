import { Injectable, Logger } from "@nestjs/common";
import * as webPush from "web-push";
import { PrismaService } from "../prisma/prisma.service";
import type { PushSubscriptionDto } from "@memo/shared";

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {
    webPush.setVapidDetails(
      process.env.VAPID_EMAIL || "mailto:test@example.com",
      process.env.VAPID_PUBLIC_KEY || "",
      process.env.VAPID_PRIVATE_KEY || "",
    );
  }

  async subscribe(userId: string, dto: PushSubscriptionDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { deleted: true };
  }

  async sendToUser(userId: string, payload: { title: string; body: string }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webPush
          .sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          )
          .catch(async (err) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await this.prisma.pushSubscription.delete({
                where: { id: sub.id },
              });
              this.logger.warn(`Removed expired subscription ${sub.id}`);
            }
            throw err;
          }),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    this.logger.debug(`Push sent to ${sent}/${subscriptions.length} subscriptions for user ${userId}`);
  }
}
