import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import detectionService from '../../src/services/detectionService.js';

function mockModelResponse(score = 0.5) {
    return mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        json: async () => ({ score }),
    }));
}

describe('detectionService', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe('detect', () => {
        it('returns a score for provided text', async () => {
            mockModelResponse(0.5);

            const result = await detectionService.detect('Sample text to analyze');

            assert.deepEqual(result, { score: 0.5 });
        });

        it('calls the model service predict endpoint', async () => {
            const fetchMock = mockModelResponse(0.5);

            await detectionService.detect('hello');

            assert.equal(fetchMock.mock.callCount(), 1);
            const [url, options] = fetchMock.mock.calls[0].arguments;
            assert.match(url, /\/predict$/);
            assert.equal(options.method, 'POST');
            assert.deepEqual(JSON.parse(options.body), { text: 'hello' });
        });

        it('throws when model service returns an error', async () => {
            mock.method(globalThis, 'fetch', async () => ({
                ok: false,
                status: 500,
            }));

            await assert.rejects(
                () => detectionService.detect('test'),
                /Model service error: 500/,
            );
        });
    });
});
