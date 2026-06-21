'use strict';

const request = require('supertest');
const { getTestApp, cleanupTestDb } = require('./helpers/setup');

let app, db;
const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must be at least 8 characters long and include at least one uppercase letter and one number.';

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

  it.each([
    ['a short password', 'Short1'],
    ['a password without an uppercase letter', 'lowercase1'],
    ['a password without a number', 'NoNumbers'],
  ])('rejects %s', async (_description, password) => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: `invalid-${password}@test.com`, password, name: 'Bob' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('password_requirements_not_met');
    expect(res.body.message).toBe(PASSWORD_REQUIREMENTS_MESSAGE);
  });
});

describe('PUT /api/user/password', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'password-change@test.com', password: 'Original1', name: 'Password User' });
    token = res.body.token;
  });

  it.each([
    ['a short password', 'Short1'],
    ['a password without an uppercase letter', 'lowercase1'],
    ['a password without a number', 'NoNumbers'],
  ])('rejects %s', async (_description, newPassword) => {
    const res = await request(app)
      .put('/api/user/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'Original1', new_password: newPassword });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('password_requirements_not_met');
    expect(res.body.message).toBe(PASSWORD_REQUIREMENTS_MESSAGE);
  });

  it('updates the password and only accepts the new password afterward', async () => {
    const changed = await request(app)
      .put('/api/user/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'Original1', new_password: 'UpdatedPass2' });

    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ ok: true });

    const oldPassword = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'password-change@test.com', password: 'Original1' });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'password-change@test.com', password: 'UpdatedPass2' });
    expect(newPassword.status).toBe(200);
    expect(newPassword.body.token).toBeDefined();
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
