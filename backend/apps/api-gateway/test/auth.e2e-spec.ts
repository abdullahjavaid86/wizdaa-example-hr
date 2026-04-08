import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';
import { AppModule as GatewayModule } from '../../../apps/api-gateway/src/app.module';
import { HttpExceptionFilter } from '../../../apps/api-gateway/src/filters/http-exception.filter';
import { TIMEOFF_SERVICE, TCP_MESSAGES } from '@app/common';

/**
 * Auth E2E — tests registration, login, and /auth/me
 * Uses a mock ClientProxy so no TCP connection is required.
 */
const mockEmployee = {
  id: 'emp-uuid-1',
  name: 'Alice',
  email: 'alice@test.com',
  role: 'EMPLOYEE',
  locationId: 'US-NYC',
  passwordHash: '$2b$12$mockhashthatis60charslongforfakingpurposeshere000000000',
};

describe('Auth E2E', () => {
  let app: INestApplication;
  let mockClient: jest.Mocked<Pick<ClientProxy, 'send'>>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    process.env.JWT_EXPIRY = '15m';
    process.env.DEBUG = 'false';

    mockClient = {
      send: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(TIMEOFF_SERVICE)
      .useValue({ send: mockClient.send, connect: jest.fn(), close: jest.fn() })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('registers successfully and returns tokens', async () => {
      mockClient.send.mockReturnValue(of(mockEmployee));
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@test.com',
          password: 'password123',
          locationId: 'US-NYC',
        });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.employee.email).toBe('alice@test.com');
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Bob', email: 'not-an-email', password: 'pass123', locationId: 'US-NYC' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for password under 8 chars', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Bob', email: 'bob@test.com', password: 'short', locationId: 'US-NYC' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns 401 for wrong credentials', async () => {
      mockClient.send.mockReturnValue(of(null));
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice@test.com', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Error exposure', () => {
    it('does not expose stack trace when DEBUG=false', async () => {
      process.env.DEBUG = 'false';
      const res = await request(app.getHttpServer()).get('/nonexistent-route');
      expect(res.body.stack).toBeUndefined();
    });
  });
});
