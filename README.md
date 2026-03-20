# ⚡ PerfStack

> Load Testing Platform built with **Claude Code** — K6 + Grafana on Kubernetes

## Stack

| Component   | Technology              | NodePort |
|-------------|-------------------------|----------|
| Frontend UI | React + Vite + Nginx    | 30080    |
| Backend API | FastAPI + Python 3.11   | 30800    |
| Load Engine | K6 (Kubernetes Job)     | —        |
| Metrics DB  | InfluxDB 1.8            | internal |
| Dashboards  | Grafana 10              | 30300    |
| Cluster     | Minikube (local K8s)    | —        |

## Quick Start

### Prerequisites
- Docker Desktop (running)
- Minikube
- kubectl
- Node.js 18+
- Python 3.11+
- Claude Code (`npm install -g @anthropic-ai/claude-code`)
- `ANTHROPIC_API_KEY` set in your environment

### 1. Start Minikube
```bash
minikube start --driver=docker --memory=4096 --cpus=2
```

### 2. Deploy PerfStack

**macOS / Linux:**
```bash
chmod +x deploy.sh && ./deploy.sh
```

**Windows PowerShell:**
```powershell
.\deploy.ps1
```

### 3. Open in browser
```
Frontend UI  →  http://<minikube-ip>:30080
Grafana      →  http://<minikube-ip>:30300   (admin / admin)
API Docs     →  http://<minikube-ip>:30800/docs
```

Get the Minikube IP with: `minikube ip`

Or open services directly: `minikube service frontend grafana backend -n perfstack`

## Auth Flow

```
React UI  →  POST /api/run-test
              ↓
          IamAuthClient.get_bearer_token()
              ↓  POST iam_url (grant_type=client_credentials)
          IAM  →  access_token (cached with TTL)
              ↓
          K6 script rendered with token + test config
              ↓
          kubectl create job k6-xxxxxxxx (ConfigMap for script)
              ↓
          K6  →  InfluxDB  →  Grafana dashboard
```

## Project Structure

```
perfstack/
├── backend/
│   ├── main.py           # FastAPI routes
│   ├── auth.py           # OAuth2 client credentials + token cache
│   ├── k8s_runner.py     # Create / monitor Kubernetes Jobs
│   ├── k6_template.js    # Jinja2 template rendered per test run
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Config panel + status polling
│   │   └── main.jsx
│   ├── nginx.conf        # Reverse proxy /api → backend
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.js
├── k8s/
│   ├── namespace.yaml
│   ├── rbac.yaml         # ServiceAccount + Role for Job creation
│   ├── influxdb.yaml
│   ├── grafana-config.yaml  # Datasource + Dashboard ConfigMaps
│   ├── grafana.yaml
│   ├── backend.yaml
│   └── frontend.yaml
├── docs/
│   ├── index.html        # Workshop hands-on guide
│   └── local-setup.html  # Local setup guide (Windows & Mac)
├── deploy.sh             # Deploy script (macOS / Linux)
├── deploy.ps1            # Deploy script (Windows PowerShell)
└── .devcontainer/
    └── devcontainer.json # GitHub Codespaces config
```

## Teardown

```bash
# Stop without deleting
minikube stop

# Delete the namespace (removes all PerfStack resources)
kubectl delete namespace perfstack

# Delete the cluster entirely
minikube delete
```

## Built with Claude Code

This platform was built live using Claude Code as the AI development copilot.
See the hands-on lab guide in `docs/index.html` for the full workflow and prompts used.

---
*PerfStack · Anthropic · Claude Code Hands-On Lab*
