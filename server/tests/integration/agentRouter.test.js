import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';

describe('agentRouter', () => {
    beforeEach(() => {
        mock.method(globalThis, 'fetch', async () => ({
            ok: true,
            json: async () => ({ score: 0.55 }),
        }));
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('POST /agent/analyze returns structured analysis', async () => {
        const response = await request(app)
            .post('/agent/analyze')
            .send({ text: 'First block.\n\nSecond block.' });

        assert.equal(response.status, 200);
        assert.equal(response.body.overallScore, 0.55);
        assert.equal(response.body.sections.length, 2);
        assert.deepEqual(response.body.actionsTaken, ['split', 'detect']);
        assert.ok(typeof response.body.report === 'string');
        assert.ok(Array.isArray(response.body.caveats));
        assert.equal(response.body.sections[0].id, 1);
        assert.ok(typeof response.body.sections[0].excerpt === 'string');
        assert.equal(response.body.sections[0].score, 0.55);
    });

    it('POST /agent/analyze returns 503 when model service is unavailable', async () => {
        mock.restoreAll();
        mock.method(globalThis, 'fetch', async () => ({
            ok: false,
            status: 503,
        }));

        const response = await request(app)
            .post('/agent/analyze')
            .send({ text: 'Sample text' });

        assert.equal(response.status, 503);
        assert.deepEqual(response.body, { error: 'Detection service unavailable' });
    });
});
