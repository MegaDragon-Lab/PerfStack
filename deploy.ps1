# PerfStack — Deploy script (Windows PowerShell)
# Usage: .\deploy.ps1
# Run from the perfstack/ root directory

$NS = "perfstack"

function Log  ($msg) { Write-Host "▶ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Err  ($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  PERFSTACK — Load Testing Platform" -ForegroundColor Red
Write-Host "  Deploy Script (Windows PowerShell)"
Write-Host "  ────────────────────────────────────"
Write-Host ""

# ── Preflight checks ──────────────────────────────────────────────────────────
Log "Running preflight checks..."

if (-not (Get-Command docker    -ErrorAction SilentlyContinue)) { Err "Docker not found. Install Docker Desktop first." }
if (-not (Get-Command minikube  -ErrorAction SilentlyContinue)) { Err "Minikube not found. Run: winget install Kubernetes.minikube" }
if (-not (Get-Command kubectl   -ErrorAction SilentlyContinue)) { Err "kubectl not found. Run: winget install Kubernetes.kubectl" }

$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) { Err "Docker daemon is not running. Start Docker Desktop first." }

$mkStatus = minikube status 2>&1
if ($mkStatus -notmatch "Running") { Err "Minikube is not running. Run: minikube start --driver=docker --memory=4096 --cpus=2" }

Ok "Preflight checks passed"
Write-Host ""

# ── Point Docker at Minikube daemon ──────────────────────────────────────────
Log "Configuring Docker → Minikube daemon..."
minikube docker-env | Invoke-Expression
Ok "Docker env configured"
Write-Host ""

# ── Build images ──────────────────────────────────────────────────────────────
Log "Building perfstack-backend:latest..."
docker build -t perfstack-backend:latest ./backend -q
if ($LASTEXITCODE -ne 0) { Err "Backend build failed" }
Ok "perfstack-backend:latest built"

Log "Building perfstack-frontend:latest..."
docker build -t perfstack-frontend:latest ./frontend -q
if ($LASTEXITCODE -ne 0) { Err "Frontend build failed" }
Ok "perfstack-frontend:latest built"
Write-Host ""

# ── Apply Kubernetes manifests ────────────────────────────────────────────────
Log "Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml      | Out-Null
kubectl apply -f k8s/rbac.yaml           | Out-Null
kubectl apply -f k8s/influxdb.yaml       | Out-Null
kubectl apply -f k8s/grafana-config.yaml | Out-Null
kubectl apply -f k8s/grafana.yaml        | Out-Null
kubectl apply -f k8s/backend.yaml        | Out-Null
kubectl apply -f k8s/frontend.yaml       | Out-Null
Ok "All manifests applied"
Write-Host ""

# ── Wait for rollouts ─────────────────────────────────────────────────────────
Log "Waiting for deployments to be ready (timeout: 3 min)..."
foreach ($deploy in @("influxdb", "grafana", "backend", "frontend")) {
    Write-Host "  waiting for $deploy..." -NoNewline
    kubectl rollout status deployment/$deploy -n $NS --timeout=3m | Out-Null
    Write-Host "`r  " -NoNewline
    Ok "$deploy is ready          "
}
Write-Host ""

# ── Print URLs ────────────────────────────────────────────────────────────────
$MINIKUBE_IP = minikube ip

Write-Host "  ══════════════════════════════════════════"
Write-Host "  PerfStack is up!" -ForegroundColor Green
Write-Host "  ══════════════════════════════════════════"
Write-Host ""
Write-Host "  Frontend UI   ->  http://${MINIKUBE_IP}:30080" -ForegroundColor Cyan
Write-Host "  Grafana       ->  http://${MINIKUBE_IP}:30300  (admin / admin)" -ForegroundColor Cyan
Write-Host "  Backend API   ->  http://${MINIKUBE_IP}:30800/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Or open services directly:"
Write-Host "  minikube service frontend grafana backend -n $NS" -ForegroundColor DarkGray
Write-Host ""
