# ⚡ PerfStack

> Load Testing Platform built by **GSA Team** — K6 + Grafana on Kubernetes

## Stack

| Component   | Technology              | URL |
|-------------|-------------------------|-----|
| Frontend UI | React + Vite + Nginx    | http://localhost |
| Backend API | FastAPI + Python 3.11   | http://localhost/api/docs |
| Load Engine | K6 (Kubernetes Job)     | — |
| Metrics DB  | InfluxDB 1.8            | internal |
| Dashboards  | Grafana 10              | http://localhost/grafana |
| Cluster     | k3d (k3s in Docker)     | — |

## Prerequisites

- Docker Desktop (running)
- k3d: `brew install k3d`
- kubectl: `brew install kubectl`
- Claude Code: `npm install -g @anthropic-ai/claude-code`
- `ANTHROPIC_API_KEY` set in your environment
- `zscaler.pem` in the project root (corporate proxy)

## Quick Start

```bash
./deploy.sh
```

That's it. Opens at:
- http://localhost — Frontend UI
- http://localhost/grafana — Grafana (admin / admin)
- http://localhost/api/docs — API Docs

## Teardown

```bash
k3d cluster delete perfstack
```

## Project Structure

```
perfstack/
├── backend/          # FastAPI — auth, K6 runner, API
├── frontend/         # React — config panel
├── k8s/              # Kubernetes manifests
├── public/           # Workshop + local setup guides (Vercel)
├── deploy.sh         # macOS / Linux
├── deploy.ps1        # Windows PowerShell
└── vercel.json       # Vercel config for docs site
```

---
*PerfStack · GSA Team*
