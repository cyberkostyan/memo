import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateReminderDto, UpdateReminderDto } from "@memo/shared";

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateReminderDto) {
    return this.prisma.reminder.create({
      data: {
        userId,
        type: dto.type,
        label: dto.label,
        category: dto.category,
        scheduleType: dto.scheduleType,
        time: dto.time,
        intervalMin: dto.intervalMin,
        inactivityMin: dto.inactivityMin,
        activeFrom: dto.activeFrom,
        activeTo: dto.activeTo,
        timezone: dto.timezone,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.reminder.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findOne(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder) throw new NotFoundException("Reminder not found");
    if (reminder.userId !== userId) throw new ForbiddenException();
    return reminder;
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const reminder = await this.findOne(userId, id);
    return this.prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        label: dto.label,
        scheduleType: dto.scheduleType,
        time: dto.time,
        intervalMin: dto.intervalMin,
        inactivityMin: dto.inactivityMin,
        activeFrom: dto.activeFrom,
        activeTo: dto.activeTo,
        enabled: dto.enabled,
      },
    });
  }

  async remove(userId: string, id: string) {
    const reminder = await this.findOne(userId, id);
    await this.prisma.reminder.delete({ where: { id: reminder.id } });
    return { deleted: true };
  }
}
