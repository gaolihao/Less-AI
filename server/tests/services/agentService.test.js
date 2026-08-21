import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import agentService, {
    splitSections,
    shouldRecheckSection,
} from '../../src/services/agentService.js';
import detectionService from '../../src/services/detectionService.js';
import paraphraseService from '../../src/services/paraphraseService.js';

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

describe('shouldRecheckSection', () => {
    it('rechecks mid and high scores only', () => {
        assert.equal(shouldRecheckSection(0.39), false);
        assert.equal(shouldRecheckSection(0.4), true);
        assert.equal(shouldRecheckSection(0.9), true);
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
        mock.method(paraphraseService, 'isEnabled', () => false);

        const result = await agentService.analyze(
            'Paragraph one is here.\n\nParagraph two is here.',
            { paraphraseCheck: false },
        );

        assert.equal(result.overallScore, 0.6);
        assert.equal(result.sections.length, 2);
        assert.equal(result.sections[0].id, 1);
        assert.equal(result.sections[0].score, 0.7);
        assert.equal(result.sections[0].recheckScore, null);
        assert.deepEqual(result.actionsTaken, ['split', 'detect']);
        assert.ok(typeof result.report === 'string');
        assert.ok(result.report.includes('60%'));
        assert.ok(Array.isArray(result.caveats));
        assert.ok(result.caveats.length > 0);
    });

    it('still detects when text has no sections after trim', async () => {
        mock.method(detectionService, 'detect', async () => ({ score: 0.2 }));

        const result = await agentService.analyze('   ', {
            paraphraseCheck: false,
        });

        assert.equal(result.overallScore, 0.2);
        assert.deepEqual(result.sections, []);
        assert.deepEqual(result.actionsTaken, ['split', 'detect']);
    });

    it('runs paraphrase recheck on mid/high sections', async () => {
        // overall, s1, s2, s3, then recheck(s1), recheck(s3)
        const detectScores = [0.65, 0.7, 0.2, 0.5, 0.55, 0.4];
        let detectCall = 0;
        mock.method(detectionService, 'detect', async () => {
            const score = detectScores[detectCall] ?? 0.5;
            detectCall += 1;
            return { score };
        });
        mock.method(paraphraseService, 'isEnabled', () => true);
        mock.method(paraphraseService, 'paraphrase', async (text) => {
            return `Rewritten: ${text}`;
        });

        const result = await agentService.analyze(
            'Risky paragraph one.\n\nSafe low score paragraph.\n\nAnother mid paragraph.',
            { paraphraseCheck: true },
        );

        assert.deepEqual(result.actionsTaken, [
            'split',
            'detect',
            'paraphrase_recheck',
        ]);
        assert.equal(result.sections[0].score, 0.7);
        assert.equal(result.sections[0].recheckScore, 0.55);
        assert.equal(result.sections[1].score, 0.2);
        assert.equal(result.sections[1].recheckScore, null);
        assert.equal(result.sections[2].score, 0.5);
        assert.equal(result.sections[2].recheckScore, 0.4);
        assert.ok(result.report.includes('Paraphrase robustness recheck'));
    });

    it('notes when paraphrase was requested but API key is missing', async () => {
        mock.method(detectionService, 'detect', async () => ({ score: 0.5 }));
        mock.method(paraphraseService, 'isEnabled', () => false);

        const result = await agentService.analyze('Only one section here.', {
            paraphraseCheck: true,
        });

        assert.deepEqual(result.actionsTaken, ['split', 'detect']);
        assert.ok(
            result.caveats.some((c) => c.includes('GEMINI_API_KEY')),
        );
    });
});
