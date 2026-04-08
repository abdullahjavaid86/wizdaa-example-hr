import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../hcm-mock/src/app.module';
import { LeaveType } from '@app/common';

describe('HCM Mock E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.HCM_DB_PATH = ':memory:';

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /hcm/balance/:empId/:locId', () => {
    it('returns empty array when no balances seeded', async () => {
      const res = await request(app.getHttpServer())
        .get('/hcm/balance/emp-1/US-NYC');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('POST /hcm/seed/:empId/:locId', () => {
    it('seeds default balances and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/hcm/seed/emp-1/US-NYC');
      expect(res.status).toBe(201);
    });

    it('after seeding, GET returns VACATION balance of 15', async () => {
      await request(app.getHttpServer()).post('/hcm/seed/emp-2/US-NYC');
      const res = await request(app.getHttpServer())
        .get('/hcm/balance/emp-2/US-NYC');
      expect(res.status).toBe(200);
      const vacation = res.body.find((b: any) => b.leaveType === LeaveType.VACATION);
      expect(vacation).toBeDefined();
      expect(vacation.balance).toBe(15);
    });
  });

  describe('PUT /hcm/balance/:empId/:locId', () => {
    it('updates balance and returns new value', async () => {
      await request(app.getHttpServer()).post('/hcm/seed/emp-3/US-NYC');
      const res = await request(app.getHttpServer())
        .put('/hcm/balance/emp-3/US-NYC')
        .send({ leaveType: LeaveType.VACATION, balance: 8 });
      expect(res.status).toBe(200);
      expect(res.body.balance).toBe(8);
    });

    it('returns 400 for invalid leaveType', async () => {
      const res = await request(app.getHttpServer())
        .put('/hcm/balance/emp-3/US-NYC')
        .send({ leaveType: 'INVALID', balance: 8 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /hcm/batch', () => {
    it('returns all seeded balances', async () => {
      await request(app.getHttpServer()).post('/hcm/seed/emp-4/US-NYC');
      const res = await request(app.getHttpServer()).post('/hcm/batch');
      expect(res.status).toBe(200);
      expect(res.body.entries).toBeDefined();
      expect(Array.isArray(res.body.entries)).toBe(true);
      expect(res.body.generatedAt).toBeDefined();
    });
  });

  describe('POST /hcm/simulate/anniversary/:empId', () => {
    it('adds bonus days to vacation balance', async () => {
      await request(app.getHttpServer()).post('/hcm/seed/emp-anniv/US-NYC');
      const before = await request(app.getHttpServer())
        .get('/hcm/balance/emp-anniv/US-NYC');
      const vacBefore = before.body.find((b: any) => b.leaveType === LeaveType.VACATION);

      const res = await request(app.getHttpServer())
        .post('/hcm/simulate/anniversary/emp-anniv')
        .send({ locationId: 'US-NYC', bonusDays: 3 });
      expect(res.status).toBe(200);

      const vacAfter = res.body.find((b: any) => b.leaveType === LeaveType.VACATION);
      expect(vacAfter.balance).toBe(vacBefore.balance + 3);
    });
  });

  describe('POST /hcm/simulate/year-reset', () => {
    it('resets balances for all employees', async () => {
      const res = await request(app.getHttpServer())
        .post('/hcm/simulate/year-reset')
        .send({ vacationDays: 20, sickDays: 12, personalDays: 5 });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('reset applied');
    });
  });
});
