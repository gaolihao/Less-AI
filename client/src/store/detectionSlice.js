import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function toPercent(score) {
  return Math.round(score * 100);
}

function mapSections(sections = []) {
  return sections.map((section) => ({
    id: section.id,
    excerpt: section.excerpt,
    aiScore: typeof section.score === 'number' ? toPercent(section.score) : null,
    flagged: Boolean(section.flagged),
    rewrittenText: section.rewrittenText ?? null,
    rewrittenExcerpt: section.rewrittenExcerpt ?? null,
    rewrittenScore:
      typeof section.rewrittenScore === 'number'
        ? toPercent(section.rewrittenScore)
        : null,
  }));
}

function mapPayload(data) {
  if (!data) return null;
  const overall =
    typeof data.overallScore === 'number' ? data.overallScore : null;
  const rewrittenOverall =
    typeof data.rewrittenOverallScore === 'number'
      ? data.rewrittenOverallScore
      : null;

  return {
    aiScore: overall === null ? null : toPercent(overall),
    humanScore: overall === null ? null : 100 - toPercent(overall),
    rewrittenAiScore:
      rewrittenOverall === null ? null : toPercent(rewrittenOverall),
    originalText: data.originalText ?? null,
    rewrittenText: data.rewrittenText ?? null,
    sections: mapSections(data.sections),
    actionsTaken: data.actionsTaken ?? [],
    report: data.report ?? null,
    caveats: data.caveats ?? [],
  };
}

export const agentTurn = createAsyncThunk(
  'detection/turn',
  async (
    { action, sessionId, text, flagThresholdPercent },
    { rejectWithValue },
  ) => {
    const response = await fetch(`${API_BASE}/agent/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        sessionId: sessionId ?? null,
        text,
        options: { flagThresholdPercent },
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return rejectWithValue(body.error ?? 'Agent request failed');
    }

    const data = await response.json();
    return {
      sessionId: data.sessionId,
      status: data.status,
      stepCompleted: data.stepCompleted,
      nextStep: data.nextStep,
      message: data.message,
      confirmOptions: data.confirmOptions ?? [],
      partial: mapPayload(data.partial),
      analysis: mapPayload(data.analysis),
    };
  },
);

const detectionSlice = createSlice({
  name: 'detection',
  initialState: {
    sessionId: null,
    pending: null,
    result: null,
    status: 'idle',
    error: null,
  },
  reducers: {
    clearSession(state) {
      state.sessionId = null;
      state.pending = null;
      state.result = null;
      state.error = null;
      state.status = 'idle';
    },
  },
  extraReducers(builder) {
    builder
      .addCase(agentTurn.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(agentTurn.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.sessionId =
          action.payload.status === 'completed' ||
          action.payload.status === 'cancelled'
            ? null
            : action.payload.sessionId;
        state.pending =
          action.payload.status === 'awaiting_confirmation'
            ? action.payload
            : null;
        state.result = action.payload.analysis;
      })
      .addCase(agentTurn.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? action.error.message;
      });
  },
});

export const { clearSession } = detectionSlice.actions;
export default detectionSlice.reducer;
