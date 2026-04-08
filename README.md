# ⚡ PerfStack v2.1.0

> Load Testing Platform — K6 + Grafana on Kubernetes

## Stack

| Component     | Technology                          | Version  |
|---------------|-------------------------------------|----------|
| Frontend UI   | React + Vite + Nginx                | —        |
| Backend API   | FastAPI + Python 3.11               | —        |
| Load Engine   | K6 + xk6-output-influxdb (custom)   | latest   |
| Metrics DB    | InfluxDB                            | 2.7      |
| Dashboards    | Grafana                             | 12.2.0   |
| Cluster       | k3d (k3s in Docker)                 | —        |
| Orchestration | k6 Operator (TestRun CRD)           | —        |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  k3d Cluster (perfstack)             │
│                                                      │
│  Frontend (Nginx) ──► Backend (FastAPI)              │
│                            │                         │
│                     k6 Operator                      │
│                       │                              │
│              TestRun (parallelism=4)                 │
│           ┌──────┬──────┬──────┬──────┐             │
│          Pod1  Pod2  Pod3  Pod4        │             │
│           └──────┴──────┴──────┴──────┘             │
│                   │ metrics                          │
│              InfluxDB v2  ◄──  Grafana               │
└─────────────────────────────────────────────────────┘
```

### Runner pod resources
| Resource | Request | Limit  |
|----------|---------|--------|
| CPU      | 500m    | 1000m  |
| Memory   | 512 MiB | 1 GiB  |

## Prerequisites

- Docker Desktop (running, ≥ 4 CPU / 6 GB RAM recommended)
- k3d: `brew install k3d`
- kubectl: `brew install kubectl`
- `zscaler.pem` in the project root (corporate proxy cert)

## Quick Start

**macOS / local:**
```bash
./deploy_mac.sh
```

**EC2 / Linux:**
```bash
./deploy_ec2.sh
```

Both scripts open at:
- `http://localhost` — Frontend UI
- `http://localhost/grafana` — Grafana (admin / admin)
- `http://localhost/api/docs` — API Swagger docs

## Features

- **4 parallel k6 runner pods** — VUs distributed evenly across pods
- **InfluxDB v2** — org/bucket/token auth, InfluxQL compatibility for Grafana
- **Real-time pod monitor** — pod status, CPU and memory per runner
- **Persistent storage** — Web Services and Custom Scenarios survive cluster deletes
- **Dark / Light theme** — toggle in the Settings menu, syncs to Grafana iframe
- **Test state recovery** — job status restored on page refresh
- **Auto-cleanup** — completed TestRun CRs deleted before each new test
- **Dry Run** — single request to validate config before load test
- **Downloadable HTML report** — k6 summary metrics after test completes
- **Zscaler SSL support** — cert injected in k6 Docker build

## Project Structure

```
perfstack/
├── backend/          # FastAPI — IAM auth, k6 runner, REST API
├── frontend/         # React — UI, theme, scenario builder
├── k6/               # Custom k6 Dockerfile (xk6-output-influxdb)
├── k8s/              # Kubernetes manifests
│   ├── backend-pvc.yaml   # Persistent volume for data
│   ├── grafana-config.yaml
│   ├── influxdb.yaml
│   └── rbac.yaml          # ClusterRole for metrics API
├── deploy_mac.sh     # macOS deploy
├── deploy_ec2.sh     # EC2 / Linux deploy
└── vercel.json
```

## Teardown

```bash
k3d cluster delete perfstack
```

## Contact

**Support:** epc_owner@fico.com
