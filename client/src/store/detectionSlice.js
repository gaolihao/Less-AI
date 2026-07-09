import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const scanText = createAsyncThunk(
  'detection/scan',
  async (text, { rejectWithValue }) => {
    const response = await fetch(`${API_BASE}/detection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      return rejectWithValue('Detection request failed');
    }

    const { score } = await response.json();
    const aiScore = Math.round(score * 100);
    return { aiScore, humanScore: 100 - aiScore };
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
