import { randomUUID } from 'node:crypto';
import detectionService from './detectionService.js';
import paraphraseService from './paraphraseService.js';

const MAX_SENTENCES = 40;
const EXCERPT_CHARS = 180;
const DEFAULT_FLAG_THRESHOLD = 0.6;
const MAX_REWRITES = 12;

/** @type {Map<string, object>} */
const sessions = new Map();

/**
 * Split text into sentence spans (for preview before model scoring).
 */
export function splitSentences(text, { maxSentences = MAX_SENTENCES } = {}) {
    const raw = String(text ?? '');
    if (!raw.trim()) {
        return [];
    }

    const pattern =
        /[^.!?]*?(?:[.!?]+["'\u201d\u2019)\]]*)(?=\s+|$)|(?:\S[^.!?]*$)/gs;
    const spans = [];

    for (const match of raw.matchAll(pattern)) {
        const full = match[0];
        if (!full) continue;
        const absoluteStart = match.index ?? 0;
        const leading = full.length - full.trimStart().length;
        const trailing = full.length - full.trimEnd().length;
        const start = absoluteStart + leading;
        const end = absoluteStart + full.length - trailing;
        const piece = raw.slice(start, end);
        if (piece.trim()) {
            spans.push({ text: piece, start, end });
        }
    }

    if (spans.length === 0) {
        const stripped = raw.trim();
        const start = raw.indexOf(stripped);
        return [
            {
                id: 1,
                text: stripped,
                excerpt: makeExcerpt(stripped),
                start,
                end: start + stripped.length,
            },
        ];
    }

    let limited = spans;
    if (spans.length > maxSentences) {
        const head = spans.slice(0, maxSentences - 1);
        const tail = spans.slice(maxSentences - 1);
        const mergedStart = tail[0].start;
        const mergedEnd = tail[tail.length - 1].end;
        limited = [
            ...head,
            {
                text: raw.slice(mergedStart, mergedEnd),
                start: mergedStart,
                end: mergedEnd,
            },
        ];
    }

    return limited.map((span, index) => ({
        id: index + 1,
        text: span.text,
        excerpt: makeExcerpt(span.text),
        start: span.start,
        end: span.end,
    }));
}

/** @deprecated Use splitSentences */
export function splitSections(text) {
    return splitSentences(text).map(({ id, text: sectionText, excerpt }) => ({
        id,
        text: sectionText,
        excerpt,
    }));
}

export function shouldRewriteSection(score, threshold = DEFAULT_FLAG_THRESHOLD) {
    return typeof score === 'number' && score >= threshold;
}

export function shouldRecheckSection(score, threshold = DEFAULT_FLAG_THRESHOLD) {
    return shouldRewriteSection(score, threshold);
}

export function normalizeFlagThreshold(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return DEFAULT_FLAG_THRESHOLD;
    }
    // Accept either 0–1 or 0–100
    const ratio = value > 1 ? value / 100 : value;
    return Math.min(1, Math.max(0, ratio));
}

/**
 * Replace rewritten spans in the original document (end → start).
 */
export function stitchRewrites(original, sections) {
    let output = String(original ?? '');
    const ordered = [...sections].sort((a, b) => b.start - a.start);

    for (const section of ordered) {
        if (typeof section.start !== 'number' || typeof section.end !== 'number') {
            continue;
        }
        const replacement = section.rewrittenText ?? section.text ?? '';
        output =
            output.slice(0, section.start) +
            replacement +
            output.slice(section.end);
    }

    return output;
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

export function buildReport({
    overallScore,
    rewrittenOverallScore,
    sections,
    rewrittenCount,
    backend,
    flagThreshold = DEFAULT_FLAG_THRESHOLD,
}) {
    const band = riskBand(overallScore);
    const pct = Math.round(overallScore * 100);
    const thresholdPct = Math.round(flagThreshold * 100);
    const flagged = sections.filter((s) =>
        shouldRewriteSection(s.score, flagThreshold),
    ).length;
    const lines = [
        `Original AI-likelihood estimate: ${pct}% (${band} risk band).`,
        `Scored ${sections.length} sentence${sections.length === 1 ? '' : 's'}` +
            (backend ? ` via ${backend}` : '') +
            `.`,
        `Flagged ${flagged} sentence${flagged === 1 ? '' : 's'} at or above ${thresholdPct}% AI-likelihood.`,
    ];

    if (rewrittenCount > 0) {
        lines.push(
            `Humanized ${rewrittenCount} flagged sentence${rewrittenCount === 1 ? '' : 's'} and stitched them back into the document.`,
        );
    } else {
        lines.push('No sentences were rewritten.');
    }

    if (typeof rewrittenOverallScore === 'number') {
        lines.push(
            `Rewritten text AI-likelihood estimate: ${Math.round(rewrittenOverallScore * 100)}%.`,
        );
    }

    lines.push(
        'This is a drafting aid — review the rewrite before using it anywhere that requires authentic voice.',
    );

    return lines.join(' ');
}

const DEFAULT_CAVEATS = [
    'Rewrites can change tone or nuance; verify meaning before publishing.',
    'Lower AI-detector scores are not proof the text is human-written.',
    'Sentence-level detectors are imperfect, especially on short sentences.',
    'Use this as an editing assistant, not as a way to misrepresent authorship.',
];

function publicSections(sections = [], flagThreshold = DEFAULT_FLAG_THRESHOLD) {
    return sections.map((section) => ({
        id: section.id,
        excerpt: section.excerpt,
        start: section.start,
        end: section.end,
        score: typeof section.score === 'number' ? section.score : null,
        flagged: shouldRewriteSection(section.score, flagThreshold),
        rewrittenText: section.rewrittenText ?? null,
        rewrittenExcerpt: section.rewrittenText
            ? makeExcerpt(section.rewrittenText)
            : null,
        rewrittenScore:
            typeof section.rewrittenScore === 'number'
                ? section.rewrittenScore
                : null,
    }));
}

function rewriteCandidates(sections = [], flagThreshold = DEFAULT_FLAG_THRESHOLD) {
    return sections
        .filter((s) => shouldRewriteSection(s.score, flagThreshold))
        .slice(0, MAX_REWRITES);
}

function buildPartial(session) {
    return {
        overallScore: session.overallScore,
        rewrittenOverallScore: session.rewrittenOverallScore,
        originalText: session.text,
        rewrittenText: session.rewrittenText,
        detectorBackend: session.detectorBackend ?? null,
        flagThreshold: session.flagThreshold,
        sections: publicSections(session.sections, session.flagThreshold),
        actionsTaken: [...session.actionsTaken],
    };
}

function buildFinalAnalysis(session) {
    const sections = publicSections(session.sections, session.flagThreshold);
    const rewrittenCount = session.sections.filter(
        (s) => s.rewrittenText && s.rewrittenText !== s.text,
    ).length;
    return {
        overallScore: session.overallScore,
        rewrittenOverallScore: session.rewrittenOverallScore,
        originalText: session.text,
        rewrittenText: session.rewrittenText ?? session.text,
        detectorBackend: session.detectorBackend ?? null,
        flagThreshold: session.flagThreshold,
        sections,
        actionsTaken: [...session.actionsTaken],
        report: buildReport({
            overallScore: session.overallScore,
            rewrittenOverallScore: session.rewrittenOverallScore,
            sections,
            rewrittenCount,
            backend: session.detectorBackend,
            flagThreshold: session.flagThreshold,
        }),
        caveats: [...session.caveats],
    };
}

async function runDetect(session) {
    const result = await detectionService.detectSentences(session.text);
    session.overallScore = result.overallScore;
    session.detectorBackend = result.backend;

    if (!session.actionsTaken.includes('detect')) {
        session.actionsTaken.push('detect');
    }

    session.sections = (result.sentences ?? []).map((sentence) => ({
        id: sentence.id,
        text: sentence.text,
        excerpt: makeExcerpt(sentence.text),
        start: sentence.start,
        end: sentence.end,
        score: sentence.score,
        rewrittenText: null,
        rewrittenScore: null,
    }));
}

async function runHumanize(session) {
    if (!paraphraseService.isEnabled()) {
        throw new Error(
            'Rewrite API key not configured (set GEMINI_API_KEY or OPENAI_API_KEY)',
        );
    }

    const candidates = rewriteCandidates(session.sections, session.flagThreshold);
    const candidateIds = new Set(candidates.map((c) => c.id));
    let rewrittenCount = 0;

    for (const section of session.sections) {
        if (!candidateIds.has(section.id)) {
            section.rewrittenText = section.text;
            section.rewrittenScore = section.score;
            continue;
        }

        try {
            const rewritten = await paraphraseService.humanize(section.text);
            section.rewrittenText = rewritten;
            const { score } = await detectionService.detect(rewritten);
            section.rewrittenScore = score;
            rewrittenCount += 1;
        } catch (err) {
            console.error(
                `Humanize failed for sentence #${section.id}:`,
                err.message,
            );
            section.rewrittenText = section.text;
            section.rewrittenScore = section.score;
            session.caveats.push(
                `Rewrite failed for sentence #${section.id}; original text kept.`,
            );
        }
    }

    session.rewrittenText = stitchRewrites(session.text, session.sections);

    const { score } = await detectionService.detect(session.rewrittenText);
    session.rewrittenOverallScore = score;

    if (rewrittenCount > 0 && !session.actionsTaken.includes('humanize')) {
        session.actionsTaken.push('humanize');
    }

    return rewrittenCount;
}

function awaiting({
    sessionId,
    stepCompleted,
    nextStep,
    message,
    partial,
    confirmOptions = ['confirm', 'cancel'],
}) {
    return {
        sessionId,
        status: 'awaiting_confirmation',
        stepCompleted,
        nextStep,
        message,
        partial,
        analysis: null,
        confirmOptions,
    };
}

function completed(sessionId, analysis, message) {
    sessions.delete(sessionId);
    return {
        sessionId,
        status: 'completed',
        stepCompleted: 'humanize',
        nextStep: null,
        message,
        partial: null,
        analysis,
        confirmOptions: [],
    };
}

async function turn({ action, sessionId, text, options = {} } = {}) {
    if (action === 'start') {
        const trimmed = String(text ?? '').trim();
        if (!trimmed) {
            const error = new Error('Text is required to start');
            error.statusCode = 400;
            throw error;
        }

        if (sessionId) {
            sessions.delete(sessionId);
        }

        const flagThreshold = normalizeFlagThreshold(
            options.flagThreshold ?? DEFAULT_FLAG_THRESHOLD,
        );
        const thresholdPct = Math.round(flagThreshold * 100);
        const id = randomUUID();
        const session = {
            text: trimmed,
            flagThreshold,
            nextStep: 'humanize',
            sections: [],
            overallScore: null,
            rewrittenOverallScore: null,
            rewrittenText: null,
            detectorBackend: null,
            actionsTaken: [],
            caveats: [...DEFAULT_CAVEATS],
        };
        sessions.set(id, session);

        await runDetect(session);
        const candidates = rewriteCandidates(
            session.sections,
            session.flagThreshold,
        );

        const llmReady = paraphraseService.isEnabled();
        const confirmOptions = llmReady
            ? candidates.length > 0
                ? ['confirm', 'skip', 'cancel']
                : ['skip', 'cancel']
            : ['skip', 'cancel'];

        const backendNote = session.detectorBackend
            ? ` (detector: ${session.detectorBackend})`
            : '';
        let message;
        if (!llmReady) {
            message = `Scored ${session.sections.length} sentence${session.sections.length === 1 ? '' : 's'}${backendNote} — overall ${Math.round(session.overallScore * 100)}%, flagged ${candidates.length} at ≥${thresholdPct}%. Rewriting needs GEMINI_API_KEY or OPENAI_API_KEY. Skip to keep the original text?`;
        } else if (candidates.length > 0) {
            message = `Scored ${session.sections.length} sentence${session.sections.length === 1 ? '' : 's'}${backendNote} — overall ${Math.round(session.overallScore * 100)}%. Flagged ${candidates.length} at ≥${thresholdPct}% AI-likelihood. Continue to humanize those and return the draft with before/after scores, or skip rewriting?`;
        } else {
            message = `Scored ${session.sections.length} sentence${session.sections.length === 1 ? '' : 's'}${backendNote} — overall ${Math.round(session.overallScore * 100)}%. Nothing met the ≥${thresholdPct}% flag threshold. Skip to keep the original text?`;
        }

        return awaiting({
            sessionId: id,
            stepCompleted: 'detect',
            nextStep: 'humanize',
            message,
            partial: buildPartial(session),
            confirmOptions,
        });
    }

    if (action === 'cancel') {
        if (sessionId) {
            sessions.delete(sessionId);
        }
        return {
            sessionId: sessionId ?? null,
            status: 'cancelled',
            stepCompleted: null,
            nextStep: null,
            message: 'Cancelled. Paste new text whenever you’re ready.',
            partial: null,
            analysis: null,
            confirmOptions: [],
        };
    }

    if (action !== 'confirm' && action !== 'skip') {
        const error = new Error('Invalid action');
        error.statusCode = 400;
        throw error;
    }

    const session = sessions.get(sessionId);
    if (!session) {
        const error = new Error('Session not found or expired');
        error.statusCode = 404;
        throw error;
    }

    if (action === 'skip') {
        if (session.nextStep !== 'humanize') {
            const error = new Error('Skip is only available before rewriting');
            error.statusCode = 400;
            throw error;
        }
        session.caveats.push('Rewrite skipped by user; original text returned.');
        session.rewrittenText = session.text;
        session.rewrittenOverallScore = session.overallScore;
        for (const section of session.sections) {
            section.rewrittenText = section.text;
            section.rewrittenScore = section.score;
        }
        const analysis = buildFinalAnalysis(session);
        return completed(
            sessionId,
            analysis,
            'Kept your original wording. Here’s the scored draft for review.',
        );
    }

    if (session.nextStep === 'humanize') {
        const candidates = rewriteCandidates(
            session.sections,
            session.flagThreshold,
        );
        if (candidates.length === 0) {
            session.rewrittenText = session.text;
            session.rewrittenOverallScore = session.overallScore;
            for (const section of session.sections) {
                section.rewrittenText = section.text;
                section.rewrittenScore = section.score;
            }
            const analysis = buildFinalAnalysis(session);
            return completed(
                sessionId,
                analysis,
                'No sentences met the flag threshold, so nothing was rewritten. Here’s the scored draft.',
            );
        }

        const rewrittenCount = await runHumanize(session);
        const analysis = buildFinalAnalysis(session);
        const before = Math.round(session.overallScore * 100);
        const after =
            typeof session.rewrittenOverallScore === 'number'
                ? Math.round(session.rewrittenOverallScore * 100)
                : null;
        const scoreNote =
            after === null
                ? ''
                : ` Before/after AI-likelihood: ${before}% → ${after}%.`;

        return completed(
            sessionId,
            analysis,
            rewrittenCount > 0
                ? `Here’s your humanized draft (${rewrittenCount} sentence${rewrittenCount === 1 ? '' : 's'} rewritten).${scoreNote} Review it before you use it.`
                : `No sentences changed. Here’s the scored draft.${scoreNote}`,
        );
    }

    const error = new Error('Session is in an invalid state');
    error.statusCode = 400;
    throw error;
}

async function analyze(text, options = {}) {
    const start = await turn({
        action: 'start',
        text,
        options,
    });

    let current = start;
    while (current.status === 'awaiting_confirmation') {
        if (
            current.nextStep === 'humanize' &&
            !current.confirmOptions.includes('confirm')
        ) {
            current = await turn({
                action: 'skip',
                sessionId: current.sessionId,
            });
            continue;
        }
        current = await turn({
            action: 'confirm',
            sessionId: current.sessionId,
        });
    }

    if (current.status !== 'completed' || !current.analysis) {
        throw new Error('One-shot humanize did not complete');
    }

    return current.analysis;
}

function clearSessions() {
    sessions.clear();
}

export default {
    analyze,
    turn,
    splitSentences,
    splitSections,
    stitchRewrites,
    shouldRewriteSection,
    shouldRecheckSection,
    buildReport,
    clearSessions,
    DEFAULT_FLAG_THRESHOLD,
    normalizeFlagThreshold,
};
