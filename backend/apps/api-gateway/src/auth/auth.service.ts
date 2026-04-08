import {
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import * as bcrypt from 'bcryptjs';
import { TCP_MESSAGES, JwtPayload } from '@app/common';
import { TIMEOFF_SERVICE } from '@app/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(TIMEOFF_SERVICE) private readonly timeOffClient: ClientProxy,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const employee = await firstValueFrom(
      this.timeOffClient.send(TCP_MESSAGES.EMPLOYEE_CREATE, dto),
    );
    return this.issueTokens(employee);
  }

  async login(dto: LoginDto) {
    const employee = await firstValueFrom(
      this.timeOffClient.send(TCP_MESSAGES.EMPLOYEE_FIND_BY_EMAIL, {
        email: dto.email,
      }),
    );

    if (!employee) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, employee.passwordHash ?? '');
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { passwordHash: _, ...safeEmployee } = employee;
    return this.issueTokens(safeEmployee);
  }

  private issueTokens(employee: {
    id: string;
    email: string;
    role: string;
    locationId: string;
    managerId?: string;
  }) {
    const payload: JwtPayload = {
      sub: employee.id,
      email: employee.email,
      role: employee.role as any,
      locationId: employee.locationId,
      managerId: employee.managerId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_REFRESH_EXPIRY ?? '7d',
    });

    return { accessToken, refreshToken, employee };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return this.issueTokens({
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        locationId: payload.locationId,
        managerId: payload.managerId,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
