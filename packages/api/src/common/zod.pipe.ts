import {
  PipeTransform,
  Injectable,
  BadRequestException,
} from "@nestjs/common";
import { ZodSchema, ZodError } from "zod";

@Injectable()
export class ZodPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`,
      );
      throw new BadRequestException({ message: "Validation failed", errors });
    }
    return result.data;
  }
}
