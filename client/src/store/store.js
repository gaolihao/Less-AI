import { configureStore } from '@reduxjs/toolkit';
import detectionReducer from './detectionSlice';

export const store = configureStore({
  reducer: {
    detection: detectionReducer,
  },
});
