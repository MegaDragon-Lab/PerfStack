#!/usr/bin/env bash
# PerfStack — Deploy script (macOS / Linux)
# k3d — no tunnel, no MetalLB, no admin rights
# Ingress exposed directly on localhost:80
set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
AMBER='\033[0;33m'
DIM='\033[2m'
NC='\033[0m'

CLUSTER_NAME="perfstack"
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
echo "  k3d — localhost:80, no tunnel, no admin rights"
echo "  ─────────────────────────────────────"
echo ""

ZSCALER_CERT="${ZSCALER_CERT:-./zscaler.pem}"

# ── Preflight checks ──────────────────────────────────────────────────────────
log "Running preflight checks..."
command -v docker >/dev/null 2>&1 || err "Docker not found. Install Docker Desktop first."
command -v k3d    >/dev/null 2>&1 || err "k3d not found. Run: brew install k3d"
command -v kubectl>/dev/null 2>&1 || err "kubectl not found. Run: brew install kubectl"
docker info >/dev/null 2>&1        || err "Docker Desktop is not running. Please start it first."
ok "Preflight checks passed"
echo ""

# ── Zscaler cert ──────────────────────────────────────────────────────────────
log "Checking Zscaler certificate..."
if [[ -f "$ZSCALER_CERT" ]]; then
  ok "Found Zscaler cert: $ZSCALER_CERT"
  ZSCALER_FOUND=true
else
  warn "zscaler.pem not found — Docker pulls may fail behind Zscaler proxy"
  ZSCALER_FOUND=false
fi
echo ""

# ── Create k3d cluster ────────────────────────────────────────────────────────
log "Checking k3d cluster..."
if k3d cluster list | grep -q "^${CLUSTER_NAME}"; then
  ok "Cluster '${CLUSTER_NAME}' already exists"
else
  log "Creating k3d cluster '${CLUSTER_NAME}'..."
  k3d cluster create ${CLUSTER_NAME} \
    --port "80:80@loadbalancer" \
    --port "443:443@loadbalancer" \
    --k3s-arg "--disable=traefik@server:0" \
    --agents 2 \
    --timeout 120s
  ok "Cluster '${CLUSTER_NAME}' created"
fi
echo ""

# ── Set kubectl context ───────────────────────────────────────────────────────
log "Setting kubectl context..."
kubectl config use-context k3d-${CLUSTER_NAME} >/dev/null
ok "Context set to k3d-${CLUSTER_NAME}"
echo ""

# ── Install nginx ingress controller ─────────────────────────────────────────
log "Installing nginx ingress controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml >/dev/null 2>&1

log "Waiting for ingress controller pod..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s >/dev/null 2>&1
ok "Ingress controller ready"
echo ""

# ── Build images directly into k3d ───────────────────────────────────────────
# k3d can import images directly — no registry needed
log "Building perfstack-backend:latest..."
if [[ "$ZSCALER_FOUND" == "true" ]]; then
  docker build --platform linux/arm64 --build-arg CERT_FILE=zscaler.pem \
    -t perfstack-backend:latest ./backend -q
else
  docker build --platform linux/arm64 -t perfstack-backend:latest ./backend -q
fi
ok "perfstack-backend:latest built"

log "Importing perfstack-backend into k3d cluster..."
k3d image import perfstack-backend:latest -c ${CLUSTER_NAME} >/dev/null 2>&1
ok "Backend image imported"

log "Building perfstack-frontend:latest..."
if [[ "$ZSCALER_FOUND" == "true" ]]; then
  docker build --platform linux/arm64 --build-arg CERT_FILE=zscaler.pem \
    -t perfstack-frontend:latest ./frontend -q
else
  docker build --platform linux/arm64 -t perfstack-frontend:latest ./frontend -q
fi
ok "perfstack-frontend:latest built"

log "Importing perfstack-frontend into k3d cluster..."
k3d image import perfstack-frontend:latest -c ${CLUSTER_NAME} >/dev/null 2>&1
ok "Frontend image imported"
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
kubectl apply -f k8s/ingress.yaml         >/dev/null
ok "All manifests applied"
echo ""

# ── Wait for app deployments ──────────────────────────────────────────────────
log "Waiting for deployments to be ready (timeout: 3 min)..."
for deploy in influxdb grafana backend frontend; do
  echo -ne "  ${DIM}waiting for ${deploy}...${NC}"
  kubectl rollout status deployment/$deploy -n $NS --timeout=3m >/dev/null 2>&1
  echo -e "\r  ${GREEN}✓${NC} ${deploy} is ready           "
done
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo "  ══════════════════════════════════════════════════════"
echo -e "  ${GREEN}🚀 PerfStack is up!${NC}"
echo -e "  ${DIM}Ingress on localhost — no tunnel, no admin rights${NC}"
echo "  ══════════════════════════════════════════════════════"
echo ""
echo -e "  ${BLUE}Frontend UI${NC}   ->  http://localhost"
echo -e "  ${BLUE}Grafana${NC}       ->  http://localhost/grafana   (admin / admin)"
echo -e "  ${BLUE}Backend API${NC}   ->  http://localhost/api/docs"
echo ""
