const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_API_BASE =
    'https://generativelanguage.googleapis.com/v1beta/models';

const INSTRUCTIONS = {
    paraphrase:
        'You paraphrase the user text. Preserve meaning but change wording and sentence structure. Return only the paraphrased text with no quotes, labels, or commentary.',
    humanize:
        'Rewrite the text so it sounds more natural and human-written, and less like generic AI output. Keep the same meaning, facts, and approximate length. Prefer varied sentence rhythm, concrete wording, and a natural voice. Avoid buzzwords, stiff parallelism, and filler transitions. Return only the rewritten text with no quotes, labels, or commentary.',
};

/**
 * Auto: gemini if GEMINI_API_KEY is set, else openai if OPENAI_API_KEY is set.
 * Override with PARAPHRASE_PROVIDER=gemini|openai
 */
function getProvider() {
    const configured = (process.env.PARAPHRASE_PROVIDER || '').toLowerCase();
    if (configured === 'gemini' || configured === 'openai') {
        return configured;
    }
    if (process.env.GEMINI_API_KEY) {
        return 'gemini';
    }
    if (process.env.OPENAI_API_KEY) {
        return 'openai';
    }
    return null;
}

function isEnabled() {
    return getProvider() !== null;
}

function getGeminiModel() {
    return process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
}

function getOpenAIModel() {
    return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function resolveInstruction(mode) {
    return INSTRUCTIONS[mode] || INSTRUCTIONS.humanize;
}

async function rewriteWithGemini(text, instruction) {
    const model = getGeminiModel();
    const url = `${GEMINI_API_BASE}/${model}:generateContent`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: instruction }],
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: String(text ?? '') }],
                },
            ],
            generationConfig: {
                temperature: 0.85,
            },
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
            `Gemini rewrite error: ${response.status}${detail ? ` ${detail}` : ''}`,
        );
    }

    const data = await response.json();
    const rewritten = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();

    if (!rewritten) {
        throw new Error('Gemini rewrite returned empty content');
    }

    return rewritten;
}

async function rewriteWithOpenAI(text, instruction) {
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: getOpenAIModel(),
            temperature: 0.85,
            messages: [
                { role: 'system', content: instruction },
                { role: 'user', content: String(text ?? '') },
            ],
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
            `OpenAI rewrite error: ${response.status}${detail ? ` ${detail}` : ''}`,
        );
    }

    const data = await response.json();
    const rewritten = data?.choices?.[0]?.message?.content?.trim();

    if (!rewritten) {
        throw new Error('OpenAI rewrite returned empty content');
    }

    return rewritten;
}

/**
 * Rewrite text via Gemini (default when key set) or OpenAI.
 * @param {string} text
 * @param {{ mode?: 'humanize' | 'paraphrase' }} [options]
 */
async function rewrite(text, options = {}) {
    const mode = options.mode === 'paraphrase' ? 'paraphrase' : 'humanize';
    const instruction = resolveInstruction(mode);
    const provider = getProvider();

    if (!provider) {
        throw new Error(
            'Rewrite API key not configured (set GEMINI_API_KEY or OPENAI_API_KEY)',
        );
    }

    if (provider === 'gemini') {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not configured');
        }
        return rewriteWithGemini(text, instruction);
    }

    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
    }
    return rewriteWithOpenAI(text, instruction);
}

async function humanize(text) {
    return rewrite(text, { mode: 'humanize' });
}

async function paraphrase(text) {
    return rewrite(text, { mode: 'paraphrase' });
}

export default { rewrite, humanize, paraphrase, isEnabled, getProvider };
