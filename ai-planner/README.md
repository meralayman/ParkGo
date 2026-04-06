# ParkGo — AI Parking Layout Planner (Python)

Approximate lot analysis from photos using **OpenCV** (contour / segmentation-style thresholding) and **heuristic layout** estimates (90° bays, standard dimensions).

> **Not** a substitute for land survey or structural engineering. Results are indicative only.

## Requirements

- **Python 3.10+** ([python.org](https://www.python.org/downloads/))

## Setup

```bash
cd ai-planner
python -m venv .venv
```

**Windows (PowerShell):**

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux:**

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API: **http://localhost:8000**
- Health: **GET** http://localhost:8000/health
- Plan: **POST** http://localhost:8000/api/plan (multipart form: `image`, `reference_meters`, optional `ref_x1`…`ref_y2` normalized 0–1)

## Frontend

The React app calls `REACT_APP_AI_PLANNER_URL` (default `http://localhost:8000`).  
Open **http://localhost:3000/ai-planner** with:

1. Terminal 1: `npm start` (project root)
2. Terminal 2: `npm start` in `backend` (optional for login)
3. Terminal 3: `uvicorn` as above

## Future improvements

- Stronger segmentation (SAM / deep models)
- **OR-Tools** or polygon packing for irregular lots
- Drone video / multi-frame fusion
