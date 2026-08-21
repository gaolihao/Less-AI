import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function toPercent(score) {
  return Math.round(score * 100);
}

export const scanText = createAsyncThunk(
  'detection/scan',
  async ({ text, paraphraseCheck }, { rejectWithValue }) => {
    const response = await fetch(`${API_BASE}/agent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        options: { paraphraseCheck },
      }),
    });

    if (!response.ok) {
      return rejectWithValue('Detection request failed');
    }

    const data = await response.json();
    const aiScore = toPercent(data.overallScore);

    return {
      aiScore,
      humanScore: 100 - aiScore,
      sections: (data.sections ?? []).map((section) => ({
        id: section.id,
        excerpt: section.excerpt,
        aiScore: toPercent(section.score),
        recheckScore:
          typeof section.recheckScore === 'number'
            ? toPercent(section.recheckScore)
            : null,
      })),
      actionsTaken: data.actionsTaken ?? [],
      report: data.report ?? '',
      caveats: data.caveats ?? [],
    };
  },
);

const detectionSlice = createSlice({
  name: 'detection',
  initialState: {
    result: null,
    status: 'idle',
    error: null,
  },
  reducers: {
    clearResult(state) {
      state.result = null;
      state.error = null;
      state.status = 'idle';
    },
  },
  extraReducers(builder) {
    builder
      .addCase(scanText.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(scanText.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.result = action.payload;
      })
      .addCase(scanText.rejected, (state, action) => {
        state.status = 'failed';
        state.result = null;
        state.error = action.payload ?? action.error.message;
      });
  },
});

export const { clearResult } = detectionSlice.actions;
export default detectionSlice.reducer;
