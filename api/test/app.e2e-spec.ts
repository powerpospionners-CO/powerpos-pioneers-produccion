import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { AuthRateGuard } from '../src/auth/auth-rate.guard';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController, AuthController],
      providers: [AppService, AuthRateGuard, { provide: AuthService, useValue: { login: () => ({ access_token: 'prueba' }) } }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('valida entradas antes de invocar autenticación y expone liveness', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ estado: 'ok', servicio: 'powerpos-api' });
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'mal', password: 'x' }).expect(400);
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'caja@example.com', password: 'valida' }).expect(201).expect({ access_token: 'prueba' });
    await request(app.getHttpServer()).post('/auth/registrar-empresa').send({ empresa: {}, admin: {} }).expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
