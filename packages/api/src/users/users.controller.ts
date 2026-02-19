import { Controller, Get, Patch, Body, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { updateUserDto } from "@memo/shared";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get("me")
  getProfile(@CurrentUser("id") userId: string) {
    return this.users.getProfile(userId);
  }

  @Patch("me")
  updateProfile(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(updateUserDto)) body: unknown,
  ) {
    return this.users.updateProfile(userId, body as any);
  }
}
