const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_API_BASE =
    'https://generativelanguage.googleapis.com/v1beta/models';

const PARAPHRASE_INSTRUCTION =
    'You paraphrase the user text. Preserve meaning but change wording and sentence structure. Return only the paraphrased text with no quotes, labels, or commentary.';

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

async function paraphraseWithGemini(text) {
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
                parts: [{ text: PARAPHRASE_INSTRUCTION }],
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: String(text ?? '') }],
                },
            ],
            generationConfig: {
                temperature: 0.7,
            },
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
            `Gemini paraphrase error: ${response.status}${detail ? ` ${detail}` : ''}`,
        );
    }

    const data = await response.json();
    const paraphrased = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();

    if (!paraphrased) {
        throw new Error('Gemini paraphrase returned empty content');
    }

    return paraphrased;
}

async function paraphraseWithOpenAI(text) {
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: getOpenAIModel(),
            temperature: 0.7,
            messages: [
                {
                    role: 'system',
                    content: PARAPHRASE_INSTRUCTION,
                },
                {
                    role: 'user',
                    content: String(text ?? ''),
                },
            ],
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
            `OpenAI paraphrase error: ${response.status}${detail ? ` ${detail}` : ''}`,
        );
    }

    const data = await response.json();
    const paraphrased = data?.choices?.[0]?.message?.content?.trim();

    if (!paraphrased) {
        throw new Error('OpenAI paraphrase returned empty content');
    }

    return paraphrased;
}

/**
 * Paraphrase text via Gemini (default when key set) or OpenAI.
 */
async function paraphrase(text) {
    const provider = getProvider();
    if (!provider) {
        throw new Error(
            'Paraphrase API key not configured (set GEMINI_API_KEY or OPENAI_API_KEY)',
        );
    }

    if (provider === 'gemini') {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not configured');
        }
        return paraphraseWithGemini(text);
    }

    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
    }
    return paraphraseWithOpenAI(text);
}

export default { paraphrase, isEnabled, getProvider };
