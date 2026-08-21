import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import humanizeService from '../../src/services/humanizeService.js';
import paraphraseService from '../../src/services/paraphraseService.js';

function mockSentenceFetch() {
    mock.method(globalThis, 'fetch', async (url, options) => {
        const path = String(url);
        if (path.includes('/predict/sentences')) {
            const body = JSON.parse(options.body);
            const text = body.text || '';
            const sentences = text
                ? [
                      {
                          id: 1,
                          text,
                          start: 0,
                          end: text.length,
                          score: 0.7,
                      },
                  ]
                : [];
            return {
                ok: true,
                json: async () => ({
                    overallScore: 0.7,
                    backend: 'tfidf',
                    sentences,
                }),
            };
        }

        return {
            ok: true,
            json: async () => ({ score: 0.55, backend: 'tfidf' }),
        };
    });
}

describe('humanizeRouter', () => {
    beforeEach(() => {
        mockSentenceFetch();
        mock.method(paraphraseService, 'isEnabled', () => false);
        humanizeService.clearSessions();
    });

    afterEach(() => {
        mock.restoreAll();
        humanizeService.clearSessions();
    });

    it('POST /humanize/analyze returns original text when rewrite is unavailable', async () => {
        const response = await request(app)
            .post('/humanize/analyze')
            .send({
                text: 'First sentence. Second sentence.',
                options: { flagThresholdPercent: 60 },
            });

        assert.equal(response.status, 200);
        assert.equal(response.body.overallScore, 0.7);
        assert.ok(response.body.sections.length >= 1);
        assert.deepEqual(response.body.actionsTaken, ['detect']);
        assert.equal(response.body.rewrittenText, 'First sentence. Second sentence.');
    });

    it('POST /humanize/analyze humanizes flagged sentences when LLM is enabled', async () => {
        mock.method(paraphraseService, 'isEnabled', () => true);
        mock.method(paraphraseService, 'humanize', async (text) => `Nice ${text}`);

        const response = await request(app)
            .post('/humanize/analyze')
            .send({
                text: 'Only one mid-risk block for rewrite.',
                options: { flagThresholdPercent: 60 },
            });

        assert.equal(response.status, 200);
        assert.deepEqual(response.body.actionsTaken, [
            'detect',
            'humanize',
        ]);
        assert.match(response.body.rewrittenText, /^Nice /);
    });

    it('POST /humanize/turn walks confirmations step by step', async () => {
        mock.method(paraphraseService, 'isEnabled', () => true);
        mock.method(paraphraseService, 'humanize', async (text) => `H ${text}`);

        const start = await request(app)
            .post('/humanize/turn')
            .send({
                action: 'start',
                text: 'Stepwise paragraph.',
                options: { flagThresholdPercent: 60 },
            });

        assert.equal(start.body.nextStep, 'humanize');
        assert.equal(start.body.stepCompleted, 'detect');

        const humanize = await request(app)
            .post('/humanize/turn')
            .send({ action: 'confirm', sessionId: start.body.sessionId });
        assert.equal(humanize.body.status, 'completed');
        assert.match(humanize.body.analysis.rewrittenText, /^H /);
    });

    it('POST /humanize/analyze returns 503 when model service is unavailable', async () => {
        mock.restoreAll();
        mock.method(globalThis, 'fetch', async () => ({
            ok: false,
            status: 503,
        }));
        mock.method(paraphraseService, 'isEnabled', () => false);

        const response = await request(app)
            .post('/humanize/analyze')
            .send({
                text: 'Sample text',
                options: { flagThresholdPercent: 60 },
            });

        assert.equal(response.status, 503);
        assert.deepEqual(response.body, { error: 'Detection service unavailable' });
    });
});
