import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import agentService, { splitSections } from '../../src/services/agentService.js';
import detectionService from '../../src/services/detectionService.js';

describe('splitSections', () => {
    it('returns empty array for blank text', () => {
        assert.deepEqual(splitSections(''), []);
        assert.deepEqual(splitSections('   \n\n  '), []);
    });

    it('splits on paragraph breaks', () => {
        const sections = splitSections('First paragraph.\n\nSecond paragraph.');
        assert.equal(sections.length, 2);
        assert.equal(sections[0].id, 1);
        assert.equal(sections[0].text, 'First paragraph.');
        assert.equal(sections[1].text, 'Second paragraph.');
    });

    it('keeps a short single block as one section', () => {
        const sections = splitSections('Just one short block.');
        assert.equal(sections.length, 1);
        assert.equal(sections[0].excerpt, 'Just one short block.');
    });

    it('truncates long excerpts', () => {
        const long = 'a'.repeat(250);
        const [section] = splitSections(long);
        assert.ok(section.excerpt.endsWith('…'));
        assert.ok(section.excerpt.length < long.length);
    });
});

describe('agentService.analyze', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('returns overall score, sections, actions, report, and caveats', async () => {
        let call = 0;
        mock.method(detectionService, 'detect', async () => {
            call += 1;
            return { score: call === 1 ? 0.6 : 0.7 };
        });

        const result = await agentService.analyze(
            'Paragraph one is here.\n\nParagraph two is here.',
        );

        assert.equal(result.overallScore, 0.6);
        assert.equal(result.sections.length, 2);
        assert.equal(result.sections[0].id, 1);
        assert.equal(result.sections[0].score, 0.7);
        assert.deepEqual(result.actionsTaken, ['split', 'detect']);
        assert.ok(typeof result.report === 'string');
        assert.ok(result.report.includes('60%'));
        assert.ok(Array.isArray(result.caveats));
        assert.ok(result.caveats.length > 0);
    });

    it('still detects when text has no sections after trim', async () => {
        mock.method(detectionService, 'detect', async () => ({ score: 0.2 }));

        const result = await agentService.analyze('   ');

        assert.equal(result.overallScore, 0.2);
        assert.deepEqual(result.sections, []);
        assert.deepEqual(result.actionsTaken, ['split', 'detect']);
    });
});
