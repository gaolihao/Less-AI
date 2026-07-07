import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import detectionService from '../../src/services/detectionService.js';

describe('detectionService', () => {
    describe('detect', () => {
        it('returns a score for provided text', () => {
            const result = detectionService.detect('Sample text to analyze');

            assert.deepEqual(result, { score: 0.5 });
        });

        it('returns a score when text is empty', () => {
            const result = detectionService.detect('');

            assert.deepEqual(result, { score: 0.5 });
        });

        it('returns a numeric score between 0 and 1', () => {
            const result = detectionService.detect('Another sample');

            assert.ok(typeof result.score === 'number');
            assert.ok(result.score >= 0 && result.score <= 1);
        });
    });
});
