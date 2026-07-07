import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import healthService from '../../src/services/healthService.js';

describe('healthService', () => {
    describe('checkHealth', () => {
        it('returns ok status', () => {
            const result = healthService.checkHealth();

            assert.deepEqual(result, { status: 'ok' });
        });
    });
});
