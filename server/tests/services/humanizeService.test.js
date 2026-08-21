import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import humanizeService, {
    splitSentences,
    stitchRewrites,
    shouldRewriteSection,
} from '../../src/services/humanizeService.js';
import detectionService from '../../src/services/detectionService.js';
import paraphraseService from '../../src/services/paraphraseService.js';

describe('splitSentences', () => {
    it('returns empty array for blank text', () => {
        assert.deepEqual(splitSentences(''), []);
        assert.deepEqual(splitSentences('   \n\n  '), []);
    });

    it('splits on sentence boundaries with spans', () => {
        const text = 'First sentence. Second sentence!';
        const sentences = splitSentences(text);
        assert.equal(sentences.length, 2);
        assert.equal(sentences[0].text, 'First sentence.');
        assert.equal(sentences[1].text, 'Second sentence!');
        assert.equal(text.slice(sentences[0].start, sentences[0].end), 'First sentence.');
    });
});

describe('stitchRewrites', () => {
    it('replaces only rewritten spans', () => {
        const original = 'Hello world. Keep this.';
        const sentences = splitSentences(original);
        sentences[0].rewrittenText = 'Hi earth.';
        sentences[1].rewrittenText = sentences[1].text;
        const stitched = stitchRewrites(original, sentences);
        assert.equal(stitched, 'Hi earth. Keep this.');
    });
});

describe('shouldRewriteSection', () => {
    it('flags scores at or above 0.6', () => {
        assert.equal(shouldRewriteSection(0.59), false);
        assert.equal(shouldRewriteSection(0.6), true);
        assert.equal(shouldRewriteSection(0.9), true);
    });
});

describe('humanizeService.analyze', () => {
    afterEach(() => {
        mock.restoreAll();
        humanizeService.clearSessions();
    });

    it('humanizes only flagged sentences and stitches the document', async () => {
        const original = 'AI sounding sentence one. Human casual sentence.';
        const spans = splitSentences(original);
        mock.method(detectionService, 'detectSentences', async () => ({
            overallScore: 0.72,
            backend: 'tfidf',
            sentences: [
                { ...spans[0], score: 0.82 },
                { ...spans[1], score: 0.2 },
            ],
        }));
        mock.method(detectionService, 'detect', async () => ({ score: 0.3 }));
        mock.method(paraphraseService, 'isEnabled', () => true);
        mock.method(paraphraseService, 'humanize', async (text) => `Human:${text}`);

        const result = await humanizeService.analyze(original, {
            flagThreshold: 0.6,
        });

        assert.equal(result.overallScore, 0.72);
        assert.deepEqual(result.actionsTaken, ['detect', 'humanize']);
        assert.match(result.rewrittenText, /^Human:AI sounding sentence one\./);
        assert.match(result.rewrittenText, /Human casual sentence\./);
        assert.equal(result.sections[0].flagged, true);
        assert.equal(result.sections[1].flagged, false);
    });

    it('skips rewrite when no API key is configured', async () => {
        mock.method(detectionService, 'detectSentences', async () => ({
            overallScore: 0.7,
            backend: 'tfidf',
            sentences: [
                {
                    id: 1,
                    text: 'Only one sentence here.',
                    start: 0,
                    end: 23,
                    score: 0.7,
                },
            ],
        }));
        mock.method(paraphraseService, 'isEnabled', () => false);

        const result = await humanizeService.analyze('Only one sentence here.', {
            flagThreshold: 0.6,
        });

        assert.deepEqual(result.actionsTaken, ['detect']);
        assert.equal(result.rewrittenText, 'Only one sentence here.');
    });
});

describe('humanizeService.turn', () => {
    afterEach(() => {
        mock.restoreAll();
        humanizeService.clearSessions();
    });

    it('asks for confirmation between sentence humanize steps', async () => {
        mock.method(detectionService, 'detectSentences', async (text) => {
            const sentences = splitSentences(text);
            return {
                overallScore: 0.7,
                backend: 'hf',
                sentences: sentences.map((s) => ({
                    ...s,
                    score: 0.7,
                })),
            };
        });
        mock.method(detectionService, 'detect', async () => ({ score: 0.25 }));
        mock.method(paraphraseService, 'isEnabled', () => true);
        mock.method(paraphraseService, 'humanize', async (text) => `H:${text}`);

        const started = await humanizeService.turn({
            action: 'start',
            text: 'Hello world paragraph.',
            options: { flagThreshold: 0.6 },
        });
        assert.equal(started.nextStep, 'humanize');
        assert.equal(started.stepCompleted, 'detect');
        assert.ok(started.partial.sections.length >= 1);

        const humanized = await humanizeService.turn({
            action: 'confirm',
            sessionId: started.sessionId,
        });
        assert.equal(humanized.status, 'completed');
        assert.ok(humanized.analysis.rewrittenText.startsWith('H:'));
    });
});
