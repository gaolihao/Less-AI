import detectionService from './detectionService.js';
import paraphraseService from './paraphraseService.js';

const MAX_SECTIONS = 15;
const LONG_BLOCK_CHARS = 400;
const EXCERPT_CHARS = 180;
const RECHECK_THRESHOLD = 0.4;
const MAX_RECHECKS = 5;

/**
 * Split text into analysis sections (paragraphs, then sentences for long blocks).
 * Pure helper — exported for unit tests.
 */
export function splitSections(text) {
    const normalized = String(text ?? '')
        .replace(/\r\n/g, '\n')
        .trim();

    if (!normalized) {
        return [];
    }

    let parts = normalized
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length === 1 && parts[0].length > LONG_BLOCK_CHARS) {
        parts = splitBySentences(parts[0]);
    }

    if (parts.length > MAX_SECTIONS) {
        const head = parts.slice(0, MAX_SECTIONS - 1);
        const tail = parts.slice(MAX_SECTIONS - 1).join('\n\n');
        parts = [...head, tail];
    }

    return parts.map((sectionText, index) => ({
        id: index + 1,
        text: sectionText,
        excerpt: makeExcerpt(sectionText),
    }));
}

export function shouldRecheckSection(score) {
    return score >= RECHECK_THRESHOLD;
}

function splitBySentences(block) {
    const sentences = block.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    if (!sentences || sentences.length < 2) {
        return [block];
    }

    const sections = [];
    let buffer = '';

    for (const sentence of sentences) {
        const next = buffer ? `${buffer} ${sentence.trim()}` : sentence.trim();
        if (buffer && next.length > LONG_BLOCK_CHARS) {
            sections.push(buffer);
            buffer = sentence.trim();
        } else {
            buffer = next;
        }
    }

    if (buffer) {
        sections.push(buffer);
    }

    return sections.length > 0 ? sections : [block];
}

function makeExcerpt(sectionText) {
    if (sectionText.length <= EXCERPT_CHARS) {
        return sectionText;
    }
    return `${sectionText.slice(0, EXCERPT_CHARS).trimEnd()}…`;
}

function riskBand(score) {
    if (score < 0.4) return 'low';
    if (score <= 0.75) return 'medium';
    return 'high';
}

function buildReport({ overallScore, sections, recheckCount }) {
    const band = riskBand(overallScore);
    const pct = Math.round(overallScore * 100);
    const highSections = sections.filter((s) => s.score > 0.75);
    const midSections = sections.filter((s) => s.score >= 0.4 && s.score <= 0.75);

    const lines = [
        `Overall AI-likelihood estimate: ${pct}% (${band} risk band).`,
        `Analyzed ${sections.length} section${sections.length === 1 ? '' : 's'}.`,
    ];

    if (highSections.length > 0) {
        lines.push(
            `Higher-signal sections: ${highSections.map((s) => `#${s.id}`).join(', ')}.`,
        );
    } else if (midSections.length > 0) {
        lines.push(
            `Uncertain / mid-range sections: ${midSections.map((s) => `#${s.id}`).join(', ')}.`,
        );
    } else {
        lines.push('No section scored in the high-risk band.');
    }

    if (recheckCount > 0) {
        const drifted = sections.filter(
            (s) =>
                typeof s.recheckScore === 'number' &&
                Math.abs(s.recheckScore - s.score) >= 0.15,
        );
        lines.push(
            `Paraphrase robustness recheck ran on ${recheckCount} section${recheckCount === 1 ? '' : 's'}.`,
        );
        if (drifted.length > 0) {
            lines.push(
                `Score shifted ≥15 pts after paraphrase on: ${drifted.map((s) => `#${s.id}`).join(', ')} — treat those estimates cautiously.`,
            );
        } else {
            lines.push('Recheck scores stayed relatively stable after paraphrase.');
        }
    }

    lines.push(
        'This is an automated screening signal for human review — not proof of authorship or misconduct.',
    );

    return lines.join(' ');
}

const DEFAULT_CAVEATS = [
    'Not proof of misconduct or AI authorship.',
    'Short sections and mixed human/AI text are less reliable.',
    'Scores are model estimates and can be wrong; use human judgment.',
    'Paraphrase recheck probes score stability under wording changes; it is not a definitive test.',
];

/**
 * v2 integrity-style analysis: split → detect → optional paraphrase recheck → report.
 */
async function analyze(text, options = {}) {
    const paraphraseCheck =
        options.paraphraseCheck ?? paraphraseService.isEnabled();

    const actionsTaken = ['split'];
    const caveats = [...DEFAULT_CAVEATS];
    const sections = splitSections(text);

    if (sections.length === 0) {
        const { score } = await detectionService.detect(text ?? '');
        actionsTaken.push('detect');

        return {
            overallScore: score,
            sections: [],
            actionsTaken,
            report: buildReport({
                overallScore: score,
                sections: [],
                recheckCount: 0,
            }),
            caveats,
        };
    }

    const { score: overallScore } = await detectionService.detect(
        String(text ?? '').trim(),
    );
    actionsTaken.push('detect');

    const scoredSections = [];
    for (const section of sections) {
        const { score } = await detectionService.detect(section.text);
        scoredSections.push({
            id: section.id,
            excerpt: section.excerpt,
            text: section.text,
            score,
            recheckScore: null,
        });
    }

    let recheckCount = 0;

    if (paraphraseCheck && !paraphraseService.isEnabled()) {
        caveats.push(
            'Paraphrase robustness check skipped — set GEMINI_API_KEY or OPENAI_API_KEY on the server to enable.',
        );
    } else if (paraphraseCheck && paraphraseService.isEnabled()) {
        for (const section of scoredSections) {
            if (recheckCount >= MAX_RECHECKS) {
                break;
            }
            if (!shouldRecheckSection(section.score)) {
                continue;
            }

            try {
                const paraphrased = await paraphraseService.paraphrase(section.text);
                const { score: recheckScore } =
                    await detectionService.detect(paraphrased);
                section.recheckScore = recheckScore;
                recheckCount += 1;
            } catch (err) {
                console.error(
                    `Paraphrase recheck failed for section #${section.id}:`,
                    err.message,
                );
                caveats.push(
                    `Paraphrase recheck failed for section #${section.id}; original score kept.`,
                );
            }
        }

        if (recheckCount > 0) {
            actionsTaken.push('paraphrase_recheck');
        }
    }

    const responseSections = scoredSections.map(
        ({ id, excerpt, score, recheckScore }) => ({
            id,
            excerpt,
            score,
            recheckScore,
        }),
    );

    return {
        overallScore,
        sections: responseSections,
        actionsTaken,
        report: buildReport({
            overallScore,
            sections: responseSections,
            recheckCount,
        }),
        caveats,
    };
}

export default { analyze, splitSections, shouldRecheckSection };
