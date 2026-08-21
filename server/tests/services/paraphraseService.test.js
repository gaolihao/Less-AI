import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import paraphraseService from '../../src/services/paraphraseService.js';

function clearProviderEnv() {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.PARAPHRASE_PROVIDER;
    delete process.env.GEMINI_MODEL;
    delete process.env.OPENAI_MODEL;
}

describe('paraphraseService', () => {
    afterEach(() => {
        mock.restoreAll();
        clearProviderEnv();
    });

    it('isEnabled is false without API keys', () => {
        clearProviderEnv();
        assert.equal(paraphraseService.isEnabled(), false);
        assert.equal(paraphraseService.getProvider(), null);
    });

    it('prefers Gemini when GEMINI_API_KEY is set', () => {
        process.env.GEMINI_API_KEY = 'gemini-key';
        process.env.OPENAI_API_KEY = 'openai-key';
        assert.equal(paraphraseService.isEnabled(), true);
        assert.equal(paraphraseService.getProvider(), 'gemini');
    });

    it('uses OpenAI when only OPENAI_API_KEY is set', () => {
        process.env.OPENAI_API_KEY = 'openai-key';
        assert.equal(paraphraseService.getProvider(), 'openai');
    });

    it('respects PARAPHRASE_PROVIDER override', () => {
        process.env.GEMINI_API_KEY = 'gemini-key';
        process.env.OPENAI_API_KEY = 'openai-key';
        process.env.PARAPHRASE_PROVIDER = 'openai';
        assert.equal(paraphraseService.getProvider(), 'openai');
    });

    it('rewrite throws when no API key is configured', async () => {
        clearProviderEnv();
        await assert.rejects(
            () => paraphraseService.humanize('hello'),
            /Rewrite API key not configured/,
        );
    });

    it('humanize returns Gemini model content', async () => {
        process.env.GEMINI_API_KEY = 'gemini-key';
        mock.method(globalThis, 'fetch', async (url, options) => {
            assert.match(String(url), /generativelanguage\.googleapis\.com/);
            assert.equal(options.headers['x-goog-api-key'], 'gemini-key');
            const body = JSON.parse(options.body);
            assert.match(
                body.systemInstruction.parts[0].text,
                /less like generic AI/i,
            );
            return {
                ok: true,
                json: async () => ({
                    candidates: [
                        {
                            content: {
                                parts: [{ text: ' Human sounding text. ' }],
                            },
                        },
                    ],
                }),
            };
        });

        const result = await paraphraseService.humanize('Original text.');
        assert.equal(result, 'Human sounding text.');
    });

    it('paraphrase returns OpenAI model content', async () => {
        process.env.OPENAI_API_KEY = 'openai-key';
        mock.method(globalThis, 'fetch', async () => ({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: ' OpenAI rewrite. ' } }],
            }),
        }));

        const result = await paraphraseService.paraphrase('Original text.');
        assert.equal(result, 'OpenAI rewrite.');
    });
});
