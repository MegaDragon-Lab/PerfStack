# PerfStack — Deploy script (Windows PowerShell / WSL2)
# Usage: .\deploy.ps1
# Run from the perfstack/ root directory with Docker Desktop running
# Requires k3d, kubectl, docker

$NS          = "perfstack"
$CLUSTER     = "perfstack"
$REG_NAME    = "perfstack-registry"
$REG_PORT    = "5001"
$INGRESS_VER = "v1.10.1"

function Log  ($msg) { Write-Host "▶ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn ($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Err  ($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  PERFSTACK — Load Testing Platform" -ForegroundColor Red
Write-Host "  Deploy Script (Windows PowerShell)"
Write-Host "  k3d — localhost:80, no tunnel, no admin rights"
Write-Host "  ────────────────────────────────────────────"
Write-Host ""

# ── Preflight checks ──────────────────────────────────────────────────────────
Log "Running preflight checks..."

if (-not (Get-Command docker  -ErrorAction SilentlyContinue)) { Err "Docker not found. Install Docker Desktop first." }
if (-not (Get-Command k3d     -ErrorAction SilentlyContinue)) { Err "k3d not found. Run: winget install k3d" }
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { Err "kubectl not found. Run: winget install Kubernetes.kubectl" }

$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) { Err "Docker daemon is not running. Start Docker Desktop first." }

Ok "Preflight checks passed"
Write-Host ""

# ── Zscaler cert ──────────────────────────────────────────────────────────────
$ZSCALER_FOUND = $false
if (Test-Path ".\zscaler.pem") {
    Ok "Found Zscaler cert: .\zscaler.pem"
    $ZSCALER_FOUND = $true
} else {
    Warn "zscaler.pem not found — Docker pulls may fail behind Zscaler proxy"
}
Write-Host ""

# ── Pre-pull all images on host Docker ────────────────────────────────────────
Log "Pre-pulling images on host Docker (bypasses Zscaler inside cluster)..."

$INFRA_IMAGES = @(
    "registry.k8s.io/ingress-nginx/controller:v1.10.1",
    "registry.k8s.io/ingress-nginx/kube-webhook-certgen:v1.4.1",
    "influxdb:1.8",
    "grafana/grafana:10.2.0",
    "grafana/k6:latest"
)

foreach ($img in $INFRA_IMAGES) {
    Write-Host "  pulling $img..." -NoNewline
    docker pull $img -q | Out-Null
    Write-Host "`r  " -NoNewline
    Ok "pulled $img         "
}
Ok "All base images pre-pulled"
Write-Host ""

# ── Local registry ────────────────────────────────────────────────────────────
Log "Setting up local registry..."
$regList = k3d registry list 2>&1
if ($regList -match "k3d-$REG_NAME") {
    Ok "Registry 'k3d-$REG_NAME' already exists"
} else {
    k3d registry create $REG_NAME --port $REG_PORT 2>&1 | Out-Null
    Ok "Registry created at localhost:$REG_PORT"
}
Write-Host ""

# ── Push infra images to local registry ───────────────────────────────────────
Log "Pushing images to local registry..."

function Push-ToRegistry($img) {
    $localTag = if ($img -match "^registry\.k8s\.io/(.+)$") {
        "localhost:${REG_PORT}/$($Matches[1])"
    } elseif ($img -match "^docker\.io/(.+)$") {
        "localhost:${REG_PORT}/$($Matches[1])"
    } elseif ($img -match "^[^/]+/[^/]+") {
        "localhost:${REG_PORT}/$img"
    } else {
        "localhost:${REG_PORT}/library/$img"
    }
    docker tag $img $localTag 2>&1 | Out-Null
    docker push $localTag -q 2>&1 | Out-Null
}

foreach ($img in $INFRA_IMAGES) {
    Write-Host "  pushing $img..." -NoNewline
    Push-ToRegistry $img
    Write-Host "`r  " -NoNewline
    Ok "pushed $img         "
}
Ok "All images in local registry"
Write-Host ""

# ── k3d registry mirrors config ───────────────────────────────────────────────
$registriesYaml = @"
mirrors:
  "registry.k8s.io":
    endpoint:
      - "http://k3d-${REG_NAME}:5000"
  "docker.io":
    endpoint:
      - "http://k3d-${REG_NAME}:5000"
"@
$registriesYaml | Out-File -FilePath "$env:TEMP\perfstack-registries.yaml" -Encoding utf8

# ── Create k3d cluster ────────────────────────────────────────────────────────
Log "Checking k3d cluster..."
$clusterList = k3d cluster list 2>&1
if ($clusterList -match "^$CLUSTER") {
    Ok "Cluster '$CLUSTER' already exists"
} else {
    Log "Creating k3d cluster '$CLUSTER'..."
    k3d cluster create $CLUSTER `
        --port "80:80@loadbalancer" `
        --port "443:443@loadbalancer" `
        --k3s-arg "--disable=traefik@server:0" `
        --agents 2 `
        --registry-use "k3d-${REG_NAME}:${REG_PORT}" `
        --registry-config "$env:TEMP\perfstack-registries.yaml" `
        --timeout 120s 2>&1 | Where-Object { $_ -match "Cluster|error|Error" }
    Ok "Cluster '$CLUSTER' created"
}
Write-Host ""

# ── Set kubectl context ───────────────────────────────────────────────────────
Log "Setting kubectl context..."
kubectl config use-context "k3d-$CLUSTER" | Out-Null
Ok "Context set to k3d-$CLUSTER"
Write-Host ""

# ── Install nginx ingress controller ─────────────────────────────────────────
Log "Installing nginx ingress controller..."
$ingressUrl = "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-${INGRESS_VER}/deploy/static/provider/cloud/deploy.yaml"
(Invoke-WebRequest -Uri $ingressUrl -UseBasicParsing).Content `
    -replace '@sha256:[a-f0-9]+', '' `
    | kubectl apply -f - | Out-Null

Log "Waiting for ingress controller..."
kubectl wait --namespace ingress-nginx `
    --for=condition=ready pod `
    --selector=app.kubernetes.io/component=controller `
    --timeout=120s | Out-Null
Ok "Ingress controller ready"
Write-Host ""

# ── Build and push app images ─────────────────────────────────────────────────
Log "Building perfstack-backend:latest..."
if ($ZSCALER_FOUND) {
    docker build --build-arg CERT_FILE=zscaler.pem -t perfstack-backend:latest ./backend -q | Out-Null
} else {
    docker build -t perfstack-backend:latest ./backend -q | Out-Null
}
if ($LASTEXITCODE -ne 0) { Err "Backend build failed" }
Ok "perfstack-backend:latest built"

Log "Pushing backend to local registry..."
docker tag perfstack-backend:latest "localhost:${REG_PORT}/library/perfstack-backend:latest"
docker push "localhost:${REG_PORT}/library/perfstack-backend:latest" -q 2>&1 | Out-Null
Ok "Backend image pushed"

Log "Building perfstack-frontend:latest..."
if ($ZSCALER_FOUND) {
    docker build --build-arg CERT_FILE=zscaler.pem -t perfstack-frontend:latest ./frontend -q | Out-Null
} else {
    docker build -t perfstack-frontend:latest ./frontend -q | Out-Null
}
if ($LASTEXITCODE -ne 0) { Err "Frontend build failed" }
Ok "perfstack-frontend:latest built"

Log "Pushing frontend to local registry..."
docker tag perfstack-frontend:latest "localhost:${REG_PORT}/library/perfstack-frontend:latest"
docker push "localhost:${REG_PORT}/library/perfstack-frontend:latest" -q 2>&1 | Out-Null
Ok "Frontend image pushed"
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
kubectl apply -f k8s/ingress.yaml        | Out-Null
Ok "All manifests applied"
Write-Host ""

# ── Restart deployments to pick up new images ─────────────────────────────────
Log "Restarting deployments to apply latest images and config..."
foreach ($dep in @("grafana", "backend", "frontend")) {
    kubectl rollout restart deployment/$dep -n $NS 2>&1 | Out-Null
}
Ok "Rollout restarts triggered"
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

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host "  ══════════════════════════════════════════"
Write-Host "  PerfStack is up!" -ForegroundColor Green
Write-Host "  ══════════════════════════════════════════"
Write-Host ""
Write-Host "  Frontend UI   ->  http://localhost" -ForegroundColor Cyan
Write-Host "  Grafana       ->  http://localhost/grafana  (admin / admin)" -ForegroundColor Cyan
Write-Host "  Backend API   ->  http://localhost/api/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Teardown: k3d cluster delete perfstack" -ForegroundColor DarkGray
Write-Host ""
