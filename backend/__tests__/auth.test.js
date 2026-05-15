'use strict';

const request = require('supertest');
const { getTestApp, cleanupTestDb } = require('./helpers/setup');

let app, db;

beforeAll(() => {
  const setup = getTestApp();
  app = setup.app;
  db = setup.db;
});

afterAll(() => {
  cleanupTestDb();
});

describe('POST /api/auth/signup', () => {
  it('creates a new user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@test.com', password: 'Secure123!', name: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('alice@test.com');
    expect(res.body.user.name).toBe('Alice');
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@test.com', password: 'Secure123!', name: 'Alice2' });

    expect(res.status).toBe(409);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'bob@test.com' });

    expect(res.status).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'bob@test.com', password: '123', name: 'Bob' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/signin', () => {
  it('signs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'alice@test.com', password: 'Secure123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@test.com');
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'alice@test.com', password: 'WrongPass!' });

    expect(res.status).toBe(401);
  });

  it('rejects non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'nobody@test.com', password: 'Whatever1!' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user profile with valid token', async () => {
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'charlie@test.com', password: 'Secure123!', name: 'Charlie' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signupRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('charlie@test.com');
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });

  it('rejects missing token', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});
