import { Controller, Post, Body, HttpCode } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { registerDto, loginDto, refreshDto } from "@memo/shared";
import { ZodPipe } from "../common/zod.pipe";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("register")
  register(@Body(new ZodPipe(registerDto)) body: unknown) {
    return this.auth.register(body as any);
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
  logout(@Body(new ZodPipe(refreshDto)) body: any) {
    return this.auth.logout(body.refreshToken);
  }
}
