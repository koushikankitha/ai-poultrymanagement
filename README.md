# Smart Sprinkler Management System for Poultry Heat Control

A full-stack IoT monitoring web application built for ESP32 + LoRa poultry shed monitoring. The platform collects real-time node data, visualizes environmental conditions, predicts sprinkler actions with a lightweight ML model, and supports secure manual override.

## Project Structure

```text
frontend/   React + Vite dashboard for monitoring and control
backend/    FastAPI API, storage, ML model, and control endpoints
```

## Features

- Real-time dashboard cards for temperature, humidity, ammonia, and soil moisture
- Multi-node monitoring with node selector and historical line charts
- ESP32 payload parser for formats like `N1, T35.6, H56, A99, S48, R10, R20`
- REST API for ingestion, latest readings, history, prediction, retraining, login, and manual control
- Lightweight ML prediction using Logistic Regression on temperature and humidity
- Admin login for manual sprinkler override
- Render-ready backend and Vercel-ready frontend configuration
- Memory-conscious defaults using polling and SQLite

## Backend Setup

1. Install Python 3.11+.
2. Create a virtual environment and install dependencies:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and update credentials and URLs.
4. Start the API:

```bash
uvicorn app.main:app --reload
```

5. Optional: load sample readings:

```bash
python seed_data.py
```

## Frontend Setup

1. Install Node.js 20+.
2. Install dependencies and run Vite:

```bash
cd frontend
npm install
npm run dev
```

3. Copy `.env.example` to `.env` and point `VITE_API_BASE_URL` at your backend.

## API Summary

- `POST /api/data`
  - Accepts either structured JSON or `{ "payload": "N1, T35.6, H56, A99, S48, R10, R20" }`
- `GET /api/data`
  - Returns the latest reading per node
- `GET /api/history?node_id=N1&limit=120`
  - Returns historical data for charts
- `POST /api/ml/predict`
  - Predicts sprinkler ON/OFF from temperature and humidity
- `POST /api/ml/retrain`
  - Retrains the model from stored readings
- `POST /api/auth/login`
  - Returns a bearer token for the admin user
- `POST /api/control/manual`
  - Protected endpoint for manual sprinkler override

## Deployment

### Render

- Backend root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Vercel

- Frontend root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://your-render-api.onrender.com/api`

## Notes

- SQLite is the default database because it is simple and memory-efficient for starter hosting.
- `MONGODB_URI` is included in the environment file so you can switch to MongoDB later if preferred.
- `ESP32_CONTROL_URL` is reserved for forwarding manual commands to the master device when that endpoint is available.
