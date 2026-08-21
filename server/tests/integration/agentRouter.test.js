import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import paraphraseService from '../../src/services/paraphraseService.js';

describe('agentRouter', () => {
    beforeEach(() => {
        mock.method(globalThis, 'fetch', async () => ({
            ok: true,
            json: async () => ({ score: 0.55 }),
        }));
        mock.method(paraphraseService, 'isEnabled', () => false);
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('POST /agent/analyze returns structured analysis', async () => {
        const response = await request(app)
            .post('/agent/analyze')
            .send({
                text: 'First block.\n\nSecond block.',
                options: { paraphraseCheck: false },
            });

        assert.equal(response.status, 200);
        assert.equal(response.body.overallScore, 0.55);
        assert.equal(response.body.sections.length, 2);
        assert.deepEqual(response.body.actionsTaken, ['split', 'detect']);
        assert.ok(typeof response.body.report === 'string');
        assert.ok(Array.isArray(response.body.caveats));
        assert.equal(response.body.sections[0].id, 1);
        assert.ok(typeof response.body.sections[0].excerpt === 'string');
        assert.equal(response.body.sections[0].score, 0.55);
        assert.equal(response.body.sections[0].recheckScore, null);
    });

    it('POST /agent/analyze can run paraphrase recheck when enabled', async () => {
        mock.method(paraphraseService, 'isEnabled', () => true);
        mock.method(paraphraseService, 'paraphrase', async () => 'Paraphrased block.');

        const scores = [0.6, 0.7, 0.45];
        let call = 0;
        mock.method(globalThis, 'fetch', async () => {
            const score = scores[call] ?? 0.5;
            call += 1;
            return {
                ok: true,
                json: async () => ({ score }),
            };
        });

        const response = await request(app)
            .post('/agent/analyze')
            .send({
                text: 'Only one mid-risk block for recheck.',
                options: { paraphraseCheck: true },
            });

        assert.equal(response.status, 200);
        assert.deepEqual(response.body.actionsTaken, [
            'split',
            'detect',
            'paraphrase_recheck',
        ]);
        assert.equal(response.body.sections[0].score, 0.7);
        assert.equal(response.body.sections[0].recheckScore, 0.45);
    });

    it('POST /agent/analyze returns 503 when model service is unavailable', async () => {
        mock.restoreAll();
        mock.method(globalThis, 'fetch', async () => ({
            ok: false,
            status: 503,
        }));
        mock.method(paraphraseService, 'isEnabled', () => false);

        const response = await request(app)
            .post('/agent/analyze')
            .send({
                text: 'Sample text',
                options: { paraphraseCheck: false },
            });

        assert.equal(response.status, 503);
        assert.deepEqual(response.body, { error: 'Detection service unavailable' });
    });
});
