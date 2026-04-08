import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Repository,
  DataSource,
  Not,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
} from "typeorm";
import { TimeOffRequest } from "./entities/time-off-request.entity";
import { LeaveBalance } from "../balances/entities/leave-balance.entity";
import { HcmService } from "../hcm/hcm.service";
import { CreateRequestDto } from "./dto/create-request.dto";
import {
  RequestStatus,
  HcmSyncStatus,
  generateIdempotencyKey,
  LeaveType,
  Role,
  AuthenticatedUser,
} from "@app/common";

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    private readonly hcmService: HcmService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateRequestDto,
  ): Promise<TimeOffRequest> {
    const daysCount = this.calculateBusinessDays(dto.startDate, dto.endDate);
    if (daysCount <= 0) {
      throw new BadRequestException(
        "Start date must be before or equal to end date",
      );
    }
    if (new Date(dto.startDate) < new Date()) {
      throw new BadRequestException("Cannot request time off in the past");
    }

    const idempotencyKey = generateIdempotencyKey(
      user.id,
      dto.startDate,
      dto.endDate,
      dto.leaveType,
    );

    const existing = await this.requestRepo.findOne({
        where: { idempotencyKey, status: In([RequestStatus.PENDING, RequestStatus.APPROVED]) },
    });
    if (existing) {
      throw new ConflictException({
        message: "Duplicate request",
        requestId: existing.id,
        status: existing.status,
      });
    }

    // Overlap check: reject if employee has any PENDING/APPROVED request
    // whose date range intersects [startDate, endDate]
    const overlapping = await this.requestRepo.findOne({
      where: {
        employeeId: user.id,
        status: In([RequestStatus.PENDING, RequestStatus.APPROVED]),
        startDate: LessThanOrEqual(new Date(dto.endDate)),
        endDate: MoreThanOrEqual(new Date(dto.startDate)),
      },
    });

    if (overlapping) {
      throw new ConflictException(
        `Date range overlaps with an existing ${overlapping.status.toLowerCase()} request ` +
          `(${new Date(overlapping.startDate).toISOString().split("T")[0]} – ${new Date(overlapping.endDate).toISOString().split("T")[0]})`,
      );
    }

    const year = new Date(dto.startDate).getFullYear();
    const balance = await this.balanceRepo.findOne({
      where: {
        employeeId: user.id,
        locationId: user.locationId,
        leaveType: dto.leaveType,
        year,
      },
    });

    // HCM is the authoritative source for available balance.
    // HCM's balance field = remaining days after approved requests.
    // We subtract our local pendingDays because HCM has no visibility into
    // requests that are still awaiting manager approval.
    // If HCM is unreachable we fall back to the local cache (defensive).
    const hcmBalance = await this.hcmService.getBalance(
      user.id,
      user.locationId,
      dto.leaveType,
    );

    let effectiveAvailable: number;
    if (hcmBalance !== null) {
      const pendingDays = balance?.pendingDays ?? 0;
      effectiveAvailable = Math.max(0, hcmBalance.balance - pendingDays);
    } else {
      this.logger.warn(
        `HCM unreachable — falling back to local balance cache for employee ${user.id}`,
      );
      effectiveAvailable = balance
        ? balance.totalDays - balance.usedDays - balance.pendingDays
        : 0;
    }

    if (daysCount > effectiveAvailable) {
      throw new BadRequestException(
        `Insufficient balance. Requested: ${daysCount} days, Available: ${effectiveAvailable} days`,
      );
    }

    const request = await this.dataSource.transaction(async (manager) => {
      const newRequest = manager.create(TimeOffRequest, {
        idempotencyKey,
        employeeId: user.id,
        locationId: user.locationId,
        leaveType: dto.leaveType,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        daysCount,
        status: RequestStatus.PENDING,
        reason: dto.reason,
        hcmSyncStatus: HcmSyncStatus.PENDING,
      });

      const savedRequest = await manager.save(TimeOffRequest, newRequest);

      if (balance) {
        balance.pendingDays =
          Math.round((balance.pendingDays + daysCount) * 10) / 10;
        await manager.save(LeaveBalance, balance);
      } else {
        const newBalance = manager.create(LeaveBalance, {
          employeeId: user.id,
          locationId: user.locationId,
          leaveType: dto.leaveType,
          year,
          totalDays: hcmBalance?.balance ?? 0,
          usedDays: 0,
          pendingDays: daysCount,
        });
        await manager.save(LeaveBalance, newBalance);
      }

      return savedRequest;
    });

    return request;
  }

  async findAll(user: AuthenticatedUser): Promise<TimeOffRequest[]> {
    // TODO: uncomment this if needs to show manager or role based all requests instead of just own requests
    // if (user.role === Role.MANAGER || user.role === Role.ADMIN) {
    //   return this.requestRepo.find({
    //     where: { locationId: user.locationId },
    //     order: { createdAt: "DESC" },
    //     take: 200,
    //   });
    // }
    return this.requestRepo.find({
      where: { employeeId: user.id },
      order: { createdAt: "DESC" },
    });
  }

  async findPending(managerId: string): Promise<TimeOffRequest[]> {
    return this.requestRepo.find({
      where: { status: RequestStatus.PENDING },
      order: { createdAt: "ASC" },
    });
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (user.role === Role.EMPLOYEE && request.employeeId !== user.id) {
      throw new ForbiddenException("Access denied");
    }
    return request;
  }

  async approve(
    id: string,
    managerId: string,
    managerNote?: string,
  ): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.status !== RequestStatus.PENDING) {
      throw new ConflictException(`Request is already ${request.status}`);
    }

    const year = (request.startDate as Date).getFullYear
      ? (request.startDate as Date).getFullYear()
      : new Date(request.startDate).getFullYear();

    const hcmBalance = await this.hcmService.getBalance(
      request.employeeId,
      request.locationId,
      request.leaveType,
    );

    return this.dataSource.transaction("SERIALIZABLE", async (manager) => {
      const balance = await manager.findOne(LeaveBalance, {
        where: {
          employeeId: request.employeeId,
          locationId: request.locationId,
          leaveType: request.leaveType,
          year,
        },
        lock: { mode: "optimistic", version: undefined },
      });

      if (!balance) throw new BadRequestException("No balance record found");

      const localAvailable =
        balance.totalDays -
        balance.usedDays -
        (balance.pendingDays - request.daysCount);

      if (hcmBalance !== null && hcmBalance.balance < request.daysCount) {
        request.status = RequestStatus.REJECTED;
        request.managerId = managerId;
        request.managerNote = "Insufficient balance per HCM verification";
        balance.pendingDays = Math.max(
          0,
          Math.round((balance.pendingDays - request.daysCount) * 10) / 10,
        );
        await manager.save(TimeOffRequest, request);
        await manager.save(LeaveBalance, balance);
        throw new BadRequestException("HCM reports insufficient balance");
      }

      if (localAvailable < request.daysCount) {
        throw new BadRequestException("Insufficient local balance");
      }

      request.status = RequestStatus.APPROVED;
      request.managerId = managerId;
      request.managerNote = managerNote;

      balance.usedDays =
        Math.round((balance.usedDays + request.daysCount) * 10) / 10;
      balance.pendingDays = Math.max(
        0,
        Math.round((balance.pendingDays - request.daysCount) * 10) / 10,
      );

      await manager.save(TimeOffRequest, request);
      await manager.save(LeaveBalance, balance);

      const newHcmBalance =
        (hcmBalance?.balance ?? balance.totalDays) - request.daysCount;
      const synced = await this.hcmService.updateBalance(
        request.employeeId,
        request.locationId,
        request.leaveType,
        Math.max(0, Math.round(newHcmBalance * 10) / 10),
      );

      request.hcmSyncStatus = synced
        ? HcmSyncStatus.SYNCED
        : HcmSyncStatus.FAILED;
      if (hcmBalance?.transactionId) {
        request.hcmTransactionId = hcmBalance.transactionId;
      }
      await manager.save(TimeOffRequest, request);

      return request;
    });
  }

  async reject(
    id: string,
    managerId: string,
    managerNote?: string,
  ): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.status !== RequestStatus.PENDING) {
      throw new ConflictException(`Request is already ${request.status}`);
    }

    return this.dataSource.transaction(async (manager) => {
      const year = new Date(request.startDate).getFullYear();
      const balance = await manager.findOne(LeaveBalance, {
        where: {
          employeeId: request.employeeId,
          locationId: request.locationId,
          leaveType: request.leaveType,
          year,
        },
      });

      request.status = RequestStatus.REJECTED;
      request.managerId = managerId;
      request.managerNote = managerNote;

      if (balance) {
        balance.pendingDays = Math.max(
          0,
          Math.round((balance.pendingDays - request.daysCount) * 10) / 10,
        );
        await manager.save(LeaveBalance, balance);
      }

      return manager.save(TimeOffRequest, request);
    });
  }

  async cancel(id: string, employeeId: string): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.employeeId !== employeeId) {
      throw new ForbiddenException("Cannot cancel another employee's request");
    }
    if (request.status !== RequestStatus.PENDING) {
      throw new ConflictException(
        `Only PENDING requests can be cancelled, current: ${request.status}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const year = new Date(request.startDate).getFullYear();
      const balance = await manager.findOne(LeaveBalance, {
        where: {
          employeeId: request.employeeId,
          locationId: request.locationId,
          leaveType: request.leaveType,
          year,
        },
      });

      request.status = RequestStatus.CANCELLED;

      if (balance) {
        balance.pendingDays = Math.max(
          0,
          Math.round((balance.pendingDays - request.daysCount) * 10) / 10,
        );
        await manager.save(LeaveBalance, balance);
      }

      return manager.save(TimeOffRequest, request);
    });
  }

  private calculateBusinessDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }
}
