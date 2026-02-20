import { Controller, Post, Delete, Body, UseGuards } from "@nestjs/common";
import { PushService } from "./push.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { pushSubscriptionDto } from "@memo/shared";

@Controller("push")
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private push: PushService) {}

  @Post("subscribe")
  subscribe(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(pushSubscriptionDto)) body: unknown,
  ) {
    return this.push.subscribe(userId, body as any);
  }

  @Delete("subscribe")
  unsubscribe(
    @CurrentUser("id") userId: string,
    @Body() body: { endpoint: string },
  ) {
    return this.push.unsubscribe(userId, body.endpoint);
  }
}
