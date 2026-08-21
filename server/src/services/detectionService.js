const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';

async function detect(text) {
    const response = await fetch(`${MODEL_SERVICE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        throw new Error(`Model service error: ${response.status}`);
    }

    const data = await response.json();
    return { score: data.score };
}

/**
 * Sentence-level AI scores (HF classifier when configured, else TF-IDF fallback).
 */
async function detectSentences(text) {
    const response = await fetch(`${MODEL_SERVICE_URL}/predict/sentences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        throw new Error(`Model service error: ${response.status}`);
    }

    const data = await response.json();
    return {
        overallScore: data.overallScore,
        backend: data.backend ?? null,
        sentences: (data.sentences ?? []).map((sentence) => ({
            id: sentence.id,
            text: sentence.text,
            start: sentence.start,
            end: sentence.end,
            score: sentence.score,
        })),
    };
}

export default { detect, detectSentences };
