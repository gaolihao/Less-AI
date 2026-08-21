"""Sentence splitting with character spans for stitch-back rewrites."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class SentenceSpan:
    text: str
    start: int
    end: int


# Sentence boundary: end punctuation + optional quotes/brackets, then whitespace or EOS.
_SENTENCE_RE = re.compile(
    r"""
    [^.!?]*?
    (?:[.!?]+["'\u201d\u2019)\]]*)
    (?=\s+|$)
    |
    \S[^.!?]*$
    """,
    re.VERBOSE | re.DOTALL,
)


def split_sentences(text: str, *, max_sentences: int = 40) -> list[SentenceSpan]:
    raw = text or ""
    if not raw.strip():
        return []

    spans: list[SentenceSpan] = []
    for match in _SENTENCE_RE.finditer(raw):
        chunk = match.group(0)
        inner_start = match.start()
        # Trim leading whitespace from the span while keeping correct indices.
        leading = len(chunk) - len(chunk.lstrip())
        trailing = len(chunk) - len(chunk.rstrip())
        start = inner_start + leading
        end = match.end() - trailing
        piece = raw[start:end]
        if piece.strip():
            spans.append(SentenceSpan(text=piece, start=start, end=end))

    if not spans:
        stripped = raw.strip()
        start = raw.find(stripped)
        return [SentenceSpan(text=stripped, start=start, end=start + len(stripped))]

    if len(spans) > max_sentences:
        head = spans[: max_sentences - 1]
        tail = spans[max_sentences - 1 :]
        merged_start = tail[0].start
        merged_end = tail[-1].end
        head.append(
            SentenceSpan(
                text=raw[merged_start:merged_end],
                start=merged_start,
                end=merged_end,
            )
        )
        spans = head

    return spans
