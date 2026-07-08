import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';

describe('healthRouter', () => {

    it('GET / returns 200 with ok status', async () => {
        const response = await request(app).get('/');

        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { status: 'ok' });
    });

    it('POST / returns 404', async () => {
        const response = await request(app).post('/');

        assert.equal(response.status, 404);
    });
});
