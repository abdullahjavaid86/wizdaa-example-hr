import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { of } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { AppModule as GatewayModule } from '../../../apps/api-gateway/src/app.module';
import { HttpExceptionFilter } from '../../../apps/api-gateway/src/filters/http-exception.filter';
import { TIMEOFF_SERVICE, TCP_MESSAGES, Role, RequestStatus, LeaveType, HcmSyncStatus } from '@app/common';
import { computeHmacSignature } from '@app/common';

const JWT_SECRET = 'test-jwt-secret-requests';

function makeToken(jwtService: JwtService, overrides = {}) {
  return jwtService.sign({
    sub: 'emp-uuid-1',
    email: 'alice@test.com',
    role: Role.EMPLOYEE,
    locationId: 'US-NYC',
    managerId: 'mgr-uuid-1',
    ...overrides,
  });
}

function makeManagerToken(jwtService: JwtService) {
  return makeToken(jwtService, {
    sub: 'mgr-uuid-1',
    email: 'mgr@test.com',
    role: Role.MANAGER,
    managerId: undefined,
  });
}

const mockRequest = {
  id: 'req-uuid-1',
  employeeId: 'emp-uuid-1',
  locationId: 'US-NYC',
  leaveType: LeaveType.VACATION,
  startDate: '2026-06-02',
  endDate: '2026-06-04',
  daysCount: 3,
  status: RequestStatus.PENDING,
  hcmSyncStatus: HcmSyncStatus.PENDING,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Requests E2E', () => {
  let app: INestApplication;
  let mockClientSend: jest.Mock;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_EXPIRY = '15m';
    process.env.DEBUG = 'false';
    process.env.HCM_WEBHOOK_SECRET = 'test-webhook-secret';

    mockClientSend = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(TIMEOFF_SERVICE)
      .useValue({
        send: mockClientSend,
        connect: jest.fn(),
        close: jest.fn(),
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /requests', () => {
    it('creates a request and returns 201', async () => {
      mockClientSend.mockReturnValue(of(mockRequest));
      const token = makeToken(jwtService);
      const res = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          leaveType: LeaveType.VACATION,
          startDate: '2026-06-02',
          endDate: '2026-06-04',
          reason: 'Holiday',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('req-uuid-1');
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app.getHttpServer())
        .post('/requests')
        .send({ leaveType: LeaveType.VACATION, startDate: '2026-06-02', endDate: '2026-06-04' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid leaveType', async () => {
      const token = makeToken(jwtService);
      const res = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ leaveType: 'INVALID_TYPE', startDate: '2026-06-02', endDate: '2026-06-04' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid date format', async () => {
      const token = makeToken(jwtService);
      const res = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ leaveType: LeaveType.VACATION, startDate: 'not-a-date', endDate: '2026-06-04' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /requests', () => {
    it('returns 200 with list for authenticated user', async () => {
      mockClientSend.mockReturnValue(of([mockRequest]));
      const token = makeToken(jwtService);
      const res = await request(app.getHttpServer())
        .get('/requests')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /requests/pending', () => {
    it('returns 403 for non-manager', async () => {
      const token = makeToken(jwtService);
      const res = await request(app.getHttpServer())
        .get('/requests/pending')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('returns 200 for manager', async () => {
      mockClientSend.mockReturnValue(of([mockRequest]));
      const token = makeManagerToken(jwtService);
      const res = await request(app.getHttpServer())
        .get('/requests/pending')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /requests/:id/approve', () => {
    it('returns 403 for employee role', async () => {
      const token = makeToken(jwtService);
      const res = await request(app.getHttpServer())
        .patch('/requests/req-uuid-1/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('returns 200 for manager role', async () => {
      mockClientSend.mockReturnValue(
        of({ ...mockRequest, status: RequestStatus.APPROVED }),
      );
      const token = makeManagerToken(jwtService);
      const res = await request(app.getHttpServer())
        .patch('/requests/req-uuid-1/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ managerNote: 'Approved!' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(RequestStatus.APPROVED);
    });
  });

  describe('PATCH /requests/:id/reject', () => {
    it('returns 200 for manager with a note', async () => {
      mockClientSend.mockReturnValue(
        of({ ...mockRequest, status: RequestStatus.REJECTED }),
      );
      const token = makeManagerToken(jwtService);
      const res = await request(app.getHttpServer())
        .patch('/requests/req-uuid-1/reject')
        .set('Authorization', `Bearer ${token}`)
        .send({ managerNote: 'Denied.' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(RequestStatus.REJECTED);
    });
  });

  describe('POST /hcm/webhook/balance-update', () => {
    it('rejects webhook without signature', async () => {
      const res = await request(app.getHttpServer())
        .post('/hcm/webhook/balance-update')
        .send({ employeeId: 'emp-1', locationId: 'US-NYC', leaveType: LeaveType.VACATION, newBalance: 10 });
      expect(res.status).toBe(401);
    });

    it('rejects webhook with wrong signature', async () => {
      const res = await request(app.getHttpServer())
        .post('/hcm/webhook/balance-update')
        .set('X-HCM-Signature', 'wrong-signature')
        .send({ employeeId: 'emp-1', locationId: 'US-NYC', leaveType: LeaveType.VACATION, newBalance: 10 });
      expect(res.status).toBe(401);
    });

    it('accepts webhook with correct HMAC signature', async () => {
      const triggeredAt = '2026-04-08T10:00:00.000Z';
      const body = {
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        newBalance: 10,
        triggeredAt,
      };
      // Canonical key order must match what the gateway verifies against
      const canonical = JSON.stringify({
        employeeId:  body.employeeId,
        locationId:  body.locationId,
        leaveType:   body.leaveType,
        newBalance:  body.newBalance,
        triggeredAt: body.triggeredAt,
      });
      const sig = computeHmacSignature(canonical, 'test-webhook-secret');
      mockClientSend.mockReturnValue(
        of({ balance: { totalDays: 10, usedDays: 0, pendingDays: 0 }, affectedRequests: [] }),
      );
      const res = await request(app.getHttpServer())
        .post('/hcm/webhook/balance-update')
        .set('X-HCM-Signature', sig)
        .send(body);
      expect(res.status).toBe(200);
    });
  });
});
