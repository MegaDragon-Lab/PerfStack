#!/usr/bin/env bash
# PerfStack — Deploy script (macOS / Linux)
# Zscaler-aware: injects the corporate CA cert into Docker builds
# Usage: chmod +x deploy.sh && ./deploy.sh
set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
AMBER='\033[0;33m'
DIM='\033[2m'
NC='\033[0m'

NS="perfstack"

log()  { echo -e "${BLUE}▶${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${AMBER}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
dim()  { echo -e "${DIM}  $1${NC}"; }

echo ""
echo "  ██████╗ ███████╗██████╗ ███████╗███████╗████████╗ █████╗  ██████╗██╗  ██╗"
echo "  ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝"
echo "  ██████╔╝█████╗  ██████╔╝█████╗  ███████╗   ██║   ███████║██║     █████╔╝ "
echo "  ██╔═══╝ ██╔══╝  ██╔══██╗██╔══╝  ╚════██║   ██║   ██╔══██║██║     ██╔═██╗ "
echo "  ██║     ███████╗██║  ██║██║     ███████║   ██║   ██║  ██║╚██████╗██║  ██╗"
echo "  ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝"
echo ""
echo "  Load Testing Platform — Deploy Script"
echo "  ─────────────────────────────────────"
echo ""

# ── Zscaler cert config ───────────────────────────────────────────────────────
ZSCALER_CERT="${ZSCALER_CERT:-./zscaler.pem}"

# ── Preflight checks ──────────────────────────────────────────────────────────
log "Running preflight checks..."
command -v docker   >/dev/null 2>&1 || err "Docker not found. Install Docker Desktop first."
command -v minikube >/dev/null 2>&1 || err "Minikube not found. Run: brew install minikube"
command -v kubectl  >/dev/null 2>&1 || err "kubectl not found. Run: brew install kubectl"
docker info >/dev/null 2>&1          || err "Docker daemon is not running. Start Docker Desktop first."
minikube status | grep -q "Running"  || err "Minikube is not running. Run: minikube start --driver=docker --memory=4096 --cpus=2"
ok "Preflight checks passed"
echo ""

# ── Zscaler cert check ────────────────────────────────────────────────────────
log "Checking Zscaler certificate..."
if [[ -f "$ZSCALER_CERT" ]]; then
  ok "Found Zscaler cert: $ZSCALER_CERT"
  ZSCALER_FOUND=true
else
  warn "zscaler.pem not found — Docker pulls may fail behind Zscaler proxy"
  warn "Fix: copy your zscaler.pem into the project root and re-run"
  ZSCALER_FOUND=false
fi
echo ""

# ── Point Docker CLI to Minikube daemon ───────────────────────────────────────
log "Configuring Docker → Minikube daemon..."
eval "$(minikube docker-env)"
ok "Docker env configured"
echo ""

# ── Build backend ─────────────────────────────────────────────────────────────
log "Building perfstack-backend:latest..."
if [[ "$ZSCALER_FOUND" == "true" ]]; then
  docker build \
    --platform linux/arm64 \
    --build-arg CERT_FILE=zscaler.pem \
    -t perfstack-backend:latest ./backend -q
else
  docker build --platform linux/arm64 -t perfstack-backend:latest ./backend -q
fi
ok "perfstack-backend:latest built"

# ── Build frontend ────────────────────────────────────────────────────────────
log "Building perfstack-frontend:latest..."
if [[ "$ZSCALER_FOUND" == "true" ]]; then
  docker build \
    --platform linux/arm64 \
    --build-arg CERT_FILE=zscaler.pem \
    -t perfstack-frontend:latest ./frontend -q
else
  docker build --platform linux/arm64 -t perfstack-frontend:latest ./frontend -q
fi
ok "perfstack-frontend:latest built"
echo ""

# ── Apply Kubernetes manifests ────────────────────────────────────────────────
log "Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml       >/dev/null
kubectl apply -f k8s/rbac.yaml            >/dev/null
kubectl apply -f k8s/influxdb.yaml        >/dev/null
kubectl apply -f k8s/grafana-config.yaml  >/dev/null
kubectl apply -f k8s/grafana.yaml         >/dev/null
kubectl apply -f k8s/backend.yaml         >/dev/null
kubectl apply -f k8s/frontend.yaml        >/dev/null
ok "All manifests applied"
echo ""

# ── Wait for rollouts ─────────────────────────────────────────────────────────
log "Waiting for deployments to be ready (timeout: 3 min)..."
for deploy in influxdb grafana backend frontend; do
  echo -ne "  ${DIM}waiting for ${deploy}...${NC}"
  kubectl rollout status deployment/$deploy -n $NS --timeout=3m >/dev/null 2>&1
  echo -e "\r  ${GREEN}✓${NC} ${deploy} is ready           "
done
echo ""

# ── Print URLs ────────────────────────────────────────────────────────────────
MINIKUBE_IP=$(minikube ip)

echo "  ══════════════════════════════════════════"
echo -e "  ${GREEN}🚀 PerfStack is up!${NC}"
echo "  ══════════════════════════════════════════"
echo ""
echo -e "  ${BLUE}Frontend UI${NC}   →  http://${MINIKUBE_IP}:30080"
echo -e "  ${BLUE}Grafana${NC}       →  http://${MINIKUBE_IP}:30300  ${DIM}(admin / admin)${NC}"
echo -e "  ${BLUE}Backend API${NC}   →  http://${MINIKUBE_IP}:30800/docs"
echo ""
echo "  Or open services directly:"
dim "minikube service frontend grafana backend -n ${NS}"
echo ""
