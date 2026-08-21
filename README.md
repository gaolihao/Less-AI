# Less AI — Humanizer Agent

A full-stack app that turns AI-sounding text into a more natural draft. A chat agent works **step by step with confirmations**: split into **sentences** → score each with an AI-vs-human detector (Hugging Face Inference when `HF_TOKEN` is set, otherwise TF-IDF) → humanize only sentences ≥60% AI-likelihood → stitch the document back.

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
client (React chat UI)
    ↓  POST /agent/turn      (stepwise humanize agent + confirmations)
    ↓  POST /agent/analyze   (one-shot humanize)
    ↓  POST /detection        (single score; still available)
server (Express)
    ├─ detect sentences → model-service /predict/sentences
    └─ humanize flagged spans → Gemini or OpenAI
model-service (FastAPI)
    ├─ sentence split + HF Inference classifier (optional HF_TOKEN)
    └─ TF-IDF fallback (scikit-learn)
```

## Project structure

```
AIDetectorProject/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI (chat analysis bubble, Gauge, etc.)
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

Optional `model-service/.env`:

```env
HF_TOKEN=hf_...
HF_DETECTOR_MODEL=Hello-SimpleAI/chatgpt-detector-roberta
DETECTOR_BACKEND=auto
```

With `HF_TOKEN`, sentence scoring uses Hugging Face Inference. Without it, the service falls back to the local TF-IDF detector per sentence.

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

Set `GEMINI_API_KEY` (preferred; free tier via Google AI Studio) or `OPENAI_API_KEY` to enable rewriting. Without a key, the agent can still split/score and skip to returning the original text.

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

### `POST /agent/turn`

Stepwise humanize agent with confirmation gates:

1. `action: "start"` + text → **immediately** scores each sentence and flags ≥60%
2. `action: "confirm"` → humanize flagged spans and **return the final draft** (with before/after scores when verification is on)
3. Optional `action: "skip"` → return original text immediately
4. `action: "cancel"` ends the session

Request example:

```json
{ "action": "start", "text": "Paragraph one.\n\nParagraph two.", "options": { "flagThresholdPercent": 60 } }
```

Response after start (scoring already done):

```json
{
  "sessionId": "...",
  "status": "awaiting_confirmation",
  "stepCompleted": "detect",
  "nextStep": "humanize",
  "message": "Scored N sentences… Flagged K at ≥60%… Continue, or skip rewriting?",
  "partial": { "overallScore": 0.72, "sections": [] },
  "analysis": null,
  "confirmOptions": ["confirm", "skip", "cancel"]
}
```

Completed analysis includes `rewrittenText`, optional `rewrittenOverallScore`, and per-section rewrite fields.

### `POST /agent/analyze`

One-shot helper that auto-confirms every step (useful for scripts/tests). Same final payload as a completed turn session.

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
