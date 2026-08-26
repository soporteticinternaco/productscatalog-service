import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('Search API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('GET /search returns 200 and an array', async () => {
    const res = await request(app.getHttpServer()).get('/tenants/elsabio/search/products?q=test&lang=es');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /search/products returns 200 and an array', async () => {
    const res = await request(app.getHttpServer())
      .post('/tenants/elsabio/search/products')
      .send({ q: 'test', lang: 'es' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /search/products with page/size query params returns 200 and an array', async () => {
    const res = await request(app.getHttpServer())
      .post('/tenants/elsabio/search/products?page=1&size=5')
      .send({ q: 'test', lang: 'es' });
    expect(res.status).toBe(200);
    expect(res.body.navigation.page).toBe(1);
    expect(res.body.navigation.limit).toBe(5);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /categories-tree returns 200 and an array', async () => {
    const res = await request(app.getHttpServer()).get('/tenants/elsabio/categories-tree?lang=es');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /categories-tree returns 200 and an array', async () => {
    const res = await request(app.getHttpServer())
      .post('/tenants/elsabio/categories-tree')
      .send({ lang: 'es' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });
});