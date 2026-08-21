import Gauge from './Gauge';

export default function AnalysisMessage({
  analysis,
  partial,
  error,
  view = 'all',
}) {
  if (error) {
    return (
      <div className="analysis-message">
        <p className="analysis-error">{error}</p>
      </div>
    );
  }

  const data = analysis ?? partial;
  if (!data) {
    return null;
  }

  const showDraft =
    (view === 'all' || view === 'draft') && Boolean(data.rewrittenText);
  const showSentences =
    (view === 'all' || view === 'sentences') && (data.sections?.length ?? 0) > 0;
  const showOverall =
    view === 'all' || view === 'draft' || view === 'overall';
  const showCaveats =
    (view === 'all' || view === 'draft') && analysis?.caveats?.length > 0;

  const hasOverall = typeof data.aiScore === 'number';
  const hasRewrittenOverall = typeof data.rewrittenAiScore === 'number';
  const sections = data.sections ?? [];
  const scored = sections.some((s) => s.aiScore !== null);

  return (
    <div className="analysis-message">
      {showOverall && hasOverall && (
        <>
          <p className="analysis-lead">
            {hasRewrittenOverall ? (
              <>
                Original AI-likelihood about <strong>{data.aiScore}%</strong>
                {' '}
                → rewritten about <strong>{data.rewrittenAiScore}%</strong>
              </>
            ) : (
              <>
                Current AI-likelihood about <strong>{data.aiScore}%</strong>
              </>
            )}
          </p>
          <div className="analysis-gauge-wrap">
            <Gauge
              value={hasRewrittenOverall ? data.rewrittenAiScore : data.aiScore}
              size="sm"
            />
          </div>
        </>
      )}

      {showDraft && (
        <div className="compare-grid">
          <div className="compare-pane">
            <h3>
              Original
              {hasOverall ? ` · ${data.aiScore}%` : ''}
            </h3>
            <pre className="rewrite-text">
              {data.originalText ?? '—'}
            </pre>
          </div>
          <div className="compare-pane compare-pane-humanized">
            <h3>
              Humanized
              {hasRewrittenOverall ? ` · ${data.rewrittenAiScore}%` : ''}
            </h3>
            <pre className="rewrite-text">
              {data.rewrittenText ?? data.originalText ?? '—'}
            </pre>
          </div>
        </div>
      )}

      {showSentences && (
        <div className="sections-block">
          <h3>{scored ? 'Sentences' : 'Proposed sentences'}</h3>
          <ul className="section-list">
            {sections.map((section) => (
              <li
                key={section.id}
                className={section.flagged ? 'section-flagged' : undefined}
              >
                <div className="section-meta">
                  <span className="section-id">
                    #{section.id}
                    {section.flagged ? ' · flagged' : ''}
                  </span>
                  <span className="section-score">
                    {section.aiScore === null
                      ? 'pending'
                      : `${section.aiScore}%`}
                    {section.rewrittenScore !== null && (
                      <span className="section-recheck">
                        {' '}
                        → {section.rewrittenScore}%
                      </span>
                    )}
                  </span>
                </div>
                <p className="section-excerpt">{section.excerpt}</p>
                {section.rewrittenExcerpt &&
                  section.rewrittenExcerpt !== section.excerpt && (
                    <p className="section-rewrite">
                      Rewrite: {section.rewrittenExcerpt}
                    </p>
                  )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showCaveats && (
        <ul className="caveats-list">
          {analysis.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
