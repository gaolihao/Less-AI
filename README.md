# AI Text Detector

A full-stack web app that estimates how likely a piece of text was written by AI. It includes a React frontend, a Node.js API with a sectioned integrity-style analyze endpoint, and a Python model service using TF-IDF + OneVsRest Logistic Regression.

The detection model (`models/tfidf_ovr_logreg/pipeline.joblib`) comes from [AI-Detector-ML](https://github.com/gaolihao/AI-Detector-ML) by [gaolihao](https://github.com/gaolihao).

## Live deployment

| Service | URL |
|---------|-----|
| Frontend | [https://ai-text-detector-client.onrender.com](https://ai-text-detector-client.onrender.com) |
| API | [https://ai-text-detector-server.onrender.com](https://ai-text-detector-server.onrender.com) |
| Model service | [https://ai-text-detector-4xxg.onrender.com](https://ai-text-detector-4xxg.onrender.com) |

### Keep-alive pings (Render free tier)

Render spins down web services after ~15 minutes with no traffic. The first request after that can take 1–2 minutes while the API and model service wake up.

**GitHub Actions (included):** `.github/workflows/keep-alive.yml` pings both services every 10 minutes. It runs on the default branch only — push the workflow to `main`/`master` for it to take effect. You can also trigger it manually from the Actions tab (`workflow_dispatch`).

**Other options:**

| Service | What to monitor | Interval |
|---------|-----------------|----------|
| [UptimeRobot](https://uptimerobot.com) | `GET` API `/` and model `/health` | 5 min (free) |
| [cron-job.org](https://cron-job.org) | Same URLs | 10–14 min |

Only the **API server** and **model service** need pings — the static frontend does not spin down.

```
client (React + Vite + Redux Toolkit)
    ↓  POST /agent/analyze   (sectioned report + optional paraphrase recheck)
    ↓  POST /detection        (single score; still available)
server (Express)
    ├─ detect → model-service /predict
    └─ paraphrase_recheck → Gemini or OpenAI (optional API key)
model-service (FastAPI + scikit-learn)
```

## Project structure

```
AIDetectorProject/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components (Gauge, etc.)
│       └── store/          # Redux store + detection async thunk
├── server/                 # Express API
│   ├── src/
│   │   ├── controllers/
│   │   ├── routers/
│   │   └── services/       # detection + agent (split/detect/report)
│   └── tests/
└── model-service/          # Python inference service
```

## Run locally

You need **Node.js 20+** and **Python 3.11+**. Run all three services in separate terminals.

### 1. Model service (port 8000)

```bash
cd model-service
pip install -r requirements.txt
python -m uvicorn main:app --port 8000
```

The service loads `models/tfidf_ovr_logreg/pipeline.joblib`. If the model is missing, it trains one automatically on first startup (requires training data).

### 2. API server (port 3000)

```bash
cd server
npm install
npm run dev
```

Optional: copy `.env.example` to `.env` and adjust values:

```env
MODEL_SERVICE_URL=http://localhost:8000
CLIENT_URL=http://localhost:5173
PARAPHRASE_PROVIDER=auto
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
# or: OPENAI_API_KEY=sk-...
```

Set `GEMINI_API_KEY` (preferred; free tier via Google AI Studio) or `OPENAI_API_KEY` to enable the v2 paraphrase robustness recheck. Without a key, analyze still works and notes that recheck was skipped.

### 3. Frontend (port 5173)

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The client calls `http://localhost:3000` by default. To override, set `VITE_API_URL` in `client/.env`:

```env
VITE_API_URL=http://localhost:3000
```

Scan requests are dispatched via Redux Toolkit (`createAsyncThunk` in `client/src/store/detectionSlice.js`).

## API

### `GET /`

Health check.

```json
{ "status": "ok" }
```

### `POST /agent/analyze`

Sectioned integrity-style analysis (v2): split → detect overall + per section → optional paraphrase recheck on mid/high sections → structured report with tool trace and caveats.

Request:

```json
{
  "text": "Paragraph one.\n\nParagraph two.",
  "options": { "paraphraseCheck": true }
}
```

Response:

```json
{
  "overallScore": 0.72,
  "sections": [
    { "id": 1, "excerpt": "Paragraph one.", "score": 0.68, "recheckScore": 0.51 },
    { "id": 2, "excerpt": "Paragraph two.", "score": 0.81, "recheckScore": 0.77 }
  ],
  "actionsTaken": ["split", "detect", "paraphrase_recheck"],
  "report": "Overall AI-likelihood estimate: 72% (medium risk band). ...",
  "caveats": [
    "Not proof of misconduct or AI authorship.",
    "Short sections and mixed human/AI text are less reliable.",
    "Scores are model estimates and can be wrong; use human judgment.",
    "Paraphrase recheck probes score stability under wording changes; it is not a definitive test."
  ]
}
```

`recheckScore` is `null` when a section was not rechecked (low score, cap reached, or paraphrase disabled/unavailable).

### `POST /detection`

Single overall score (kept for simple clients and tests).

Request:

```json
{ "text": "Your text to analyze." }
```

Response:

```json
{ "score": 0.72 }
```

`score` is the estimated probability the text is AI-generated (0–1).

## Tests

Server tests use Node's built-in test runner with Supertest.

```bash
cd server
npm test
```

Coverage report (used in CI):

```bash
npm run test:coverage
```

GitHub Actions runs `npm run test:coverage` on push and pull request (see `.github/workflows/test.yml`).

## Train the TF-IDF model (optional)

The training pipeline in this repo is adapted from [AI-Detector-ML](https://github.com/gaolihao/AI-Detector-ML). To retrain locally:

```bash
cd model-service
python predict_tfidf_logreg.py --train
```

Or with a custom dataset:

```bash
python predict_tfidf_logreg.py --train --dataset-csv path/to/ai_detector_dataset.csv
```

## Storybook

```bash
cd client
npm run storybook
```

## Tech stack

- **Frontend:** React, Vite, Redux Toolkit, react-redux
- **API:** Express, CORS, Supertest
- **Model:** scikit-learn (TF-IDF + OneVsRest Logistic Regression), FastAPI, uvicorn — model from [AI-Detector-ML](https://github.com/gaolihao/AI-Detector-ML)
- **CI:** GitHub Actions (server tests + coverage)

---

This project was built with the assistance of [Cursor](https://cursor.com).
