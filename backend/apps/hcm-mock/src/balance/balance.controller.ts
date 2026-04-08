import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BalanceService } from './balance.service';
import { LeaveType } from '@app/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsNumber, IsEnum, IsString, Min } from 'class-validator';

class UpdateBalanceDto {
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @IsNumber()
  @Min(0)
  balance: number;
}

class BatchSimulateDto {
  @IsNumber()
  @Min(0)
  vacationDays: number;

  @IsNumber()
  @Min(0)
  sickDays: number;

  @IsNumber()
  @Min(0)
  personalDays: number;
}

@ApiTags('hcm')
@Controller('hcm')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get('balance/:employeeId/:locationId')
  @ApiOperation({ summary: 'Get all balances for an employee+location' })
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.balanceService.getBalance(employeeId, locationId);
  }

  @Get('balance/:employeeId/:locationId/:leaveType')
  @ApiOperation({ summary: 'Get balance by type' })
  async getBalanceByType(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Param('leaveType') leaveType: string,
  ) {
    if (!Object.values(LeaveType).includes(leaveType as LeaveType)) {
      throw new BadRequestException(`Invalid leaveType: ${leaveType}`);
    }
    return this.balanceService.getBalanceByType(
      employeeId,
      locationId,
      leaveType as LeaveType,
    );
  }

  @Put('balance/:employeeId/:locationId')
  @ApiOperation({ summary: 'Update balance in HCM (called by ExampleHR after approval)' })
  async updateBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateBalanceDto,
  ) {
    return this.balanceService.updateBalance(
      employeeId,
      locationId,
      dto.leaveType,
      dto.balance,
    );
  }

  @Post('batch')
  @ApiOperation({ summary: 'Return full corpus of all balances' })
  @HttpCode(HttpStatus.OK)
  async getBatch() {
    return this.balanceService.getBatch();
  }

  @Post('simulate/anniversary/:employeeId')
  @ApiOperation({ summary: 'Simulate work anniversary bonus for an employee' })
  @HttpCode(HttpStatus.OK)
  async simulateAnniversary(
    @Param('employeeId') employeeId: string,
    @Body() body: { locationId: string; bonusDays?: number },
  ) {
    const bonusDays = body.bonusDays ?? 2;
    return this.balanceService.applyAnniversaryBonus(
      employeeId,
      body.locationId,
      bonusDays,
    );
  }

  @Post('simulate/year-reset')
  @ApiOperation({ summary: 'Simulate year-start balance reset for all employees' })
  @HttpCode(HttpStatus.OK)
  async simulateYearReset(@Body() body: BatchSimulateDto) {
    const resetValues = {
      [LeaveType.VACATION]: body.vacationDays ?? 15,
      [LeaveType.SICK]: body.sickDays ?? 10,
      [LeaveType.PERSONAL]: body.personalDays ?? 3,
      [LeaveType.MATERNITY]: 0,
      [LeaveType.PATERNITY]: 0,
    } as Record<LeaveType, number>;

    await this.balanceService.applyYearReset(new Date().getFullYear(), resetValues);
    return { message: 'Year reset applied', year: new Date().getFullYear() };
  }

  @Post('seed/:employeeId/:locationId')
  @HttpCode(HttpStatus.CREATED)
  async seedBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    await this.balanceService.seedDefaultBalance(employeeId, locationId);
    return { message: 'Seeded default balance' };
  }
}
