import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { AuditLogService } from "./audit-log.service";

const AUDITED_ROUTES = new Map<string, string>([
  ["GET /users/me", "view_profile"],
  ["PATCH /users/me", "update_profile"],
  ["GET /events", "list_events"],
  ["POST /events", "create_event"],
  ["PATCH /events/:id", "update_event"],
  ["DELETE /events/:id", "delete_event"],
  ["GET /events/export", "export_events_xlsx"],
  ["GET /reminders", "list_reminders"],
  ["POST /reminders", "create_reminder"],
  ["PATCH /reminders/:id", "update_reminder"],
  ["DELETE /reminders/:id", "delete_reminder"],
  ["GET /privacy/export", "export_data"],
  ["POST /privacy/delete-request", "request_deletion"],
  ["DELETE /privacy/delete-request", "cancel_deletion"],
  ["POST /privacy/consents", "update_consent"],
]);

function matchRoute(method: string, url: string): string | undefined {
  const path = url.split("?")[0].replace(/\/api\//, "/");
  for (const [pattern, action] of AUDITED_ROUTES) {
    const [m, p] = pattern.split(" ");
    if (m !== method) continue;
    const regex = new RegExp("^" + p.replace(/:[\w]+/g, "[\\w-]+") + "$");
    if (regex.test(path)) return action;
  }
  return undefined;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private auditLog: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;
    const action = matchRoute(method, url);

    if (!action) return next.handle();

    const userId = req.user?.id;
    const resource = url.split("?")[0].split("/").filter(Boolean)[0] ?? "unknown";
    const ip = req.ip || req.headers["x-forwarded-for"];

    return next.handle().pipe(
      tap(() => {
        this.auditLog
          .log({
            userId,
            targetId: userId,
            action,
            resource,
            ipAddress: ip,
          })
          .catch(() => {});
      }),
    );
  }
}
