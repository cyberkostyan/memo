import {
  Controller,
  Post,
  Body,
  HttpCode,
  Req,
  UseGuards,
  Request,
} from "@nestjs/common";
import { Request as ExpressRequest } from "express";
import { AuthService } from "./auth.service";
import {
  registerDto,
  loginDto,
  refreshDto,
  changePasswordDto,
  resetPasswordDto,
} from "@memo/shared";
import type { ChangePasswordDto, ResetPasswordDto } from "@memo/shared";
import { ZodPipe } from "../common/zod.pipe";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("register")
  register(@Body(new ZodPipe(registerDto)) body: unknown, @Req() req: ExpressRequest) {
    return this.auth.register(
      body as any,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Post("login")
  @HttpCode(200)
  login(@Body(new ZodPipe(loginDto)) body: unknown) {
    return this.auth.login(body as any);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshDto)) body: any) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@Body(new ZodPipe(refreshDto)) body: any, @Request() req: any) {
    await this.auth.logout(body.refreshToken, req.user.id);
    return { message: "Logged out" };
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body(new ZodPipe(changePasswordDto)) body: ChangePasswordDto,
    @Request() req: any,
  ) {
    await this.auth.changePassword(req.user.id, body);
    return { message: "Password changed" };
  }

  @Post("reset-password")
  async resetPassword(
    @Body(new ZodPipe(resetPasswordDto)) body: ResetPasswordDto,
  ) {
    await this.auth.resetPassword(body);
    return { message: "If the account exists, it has been reset" };
  }
}
