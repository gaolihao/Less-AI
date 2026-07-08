import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';

describe('detectionRouter', () => {

    it('POST /detection returns 200 with detection score', async () => {
        const response = await request(app)
            .post('/detection')
            .send({ text: 'Sample text to analyze' });

        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { score: 0.5 });
    });

    it('POST /detection accepts empty text', async () => {
        const response = await request(app)
            .post('/detection')
            .send({ text: '' });

        assert.equal(response.status, 200);
        assert.ok(typeof response.body.score === 'number');
    });

    it('GET /detection returns 404', async () => {
        const response = await request(app).get('/detection');

        assert.equal(response.status, 404);
    });
});
