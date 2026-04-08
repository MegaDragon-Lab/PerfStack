#!/usr/bin/env bash
# PerfStack — Deploy script (EC2 / Linux)
set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

CLUSTER_NAME="perfstack"
NS="perfstack"
INGRESS_VERSION="v1.10.1"
REG_NAME="perfstack-registry"
REG_PORT="5001"

log()  { echo -e "${BLUE}▶${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${RED}!${NC} $1"; }

echo ""
echo "  ██████╗ ███████╗██████╗ ███████╗███████╗████████╗ █████╗  ██████╗██╗  ██╗"
echo "  ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝"
echo "  ██████╔╝█████╗  ██████╔╝█████╗  ███████╗   ██║   ███████║██║     █████╔╝ "
echo "  ██╔═══╝ ██╔══╝  ██╔══██╗██╔══╝  ╚════██║   ██║   ██╔══██║██║     ██╔═██╗ "
echo "  ██║     ███████╗██║  ██║██║     ███████║   ██║   ██║  ██║╚██████╗██║  ██╗"
echo "  ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝"
echo ""
echo "  Load Testing Platform — Deploy Script (EC2)"
echo "  k3d — localhost:80, no tunnel, no admin rights"
echo "  ─────────────────────────────────────"
echo ""

# ── Preflight checks ──────────────────────────────────────────────────────────
log "Running preflight checks..."
command -v docker  >/dev/null 2>&1 || { echo "Docker not found"; exit 1; }
command -v k3d     >/dev/null 2>&1 || { echo "k3d not found"; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl not found"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker not running"; exit 1; }
ok "Preflight checks passed"
echo ""

# ── Create local registry if missing ─────────────────────────────────────────
log "Setting up local registry..."
if k3d registry list 2>/dev/null | grep -q "${REG_NAME}"; then
  ok "Registry 'k3d-${REG_NAME}' already exists"
else
  k3d registry create ${REG_NAME} --port ${REG_PORT} >/dev/null
  ok "Registry created at localhost:${REG_PORT}"
fi
echo ""

# ── Persistent data directory (survives cluster delete) ───────────────────────
PERSIST_DIR="${HOME}/.perfstack/data"
log "Ensuring persistent data dir: ${PERSIST_DIR}..."
mkdir -p "${PERSIST_DIR}"
ok "Persistent data dir ready"

# ── Delete old cluster ───────────────────────────────────────────────────────
log "Deleting old cluster (if any)..."
k3d cluster delete ${CLUSTER_NAME} 2>/dev/null || true
ok "Old cluster deleted"
echo ""

# ── Create k3d cluster ───────────────────────────────────────────────────────
log "Creating k3d cluster '${CLUSTER_NAME}'..."
k3d cluster create ${CLUSTER_NAME} \
  --port "80:80@loadbalancer" \
  --port "443:443@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0" \
  --agents 2 \
  --registry-use k3d-${REG_NAME}:${REG_PORT} \
  --volume "${PERSIST_DIR}:/host-data/perfstack@all" \
  --timeout 120s >/dev/null
ok "Cluster '${CLUSTER_NAME}' created"
echo ""

# ── Set kubectl context ───────────────────────────────────────────────────────
log "Setting kubectl context..."
kubectl config use-context k3d-${CLUSTER_NAME} >/dev/null
ok "Context set to k3d-${CLUSTER_NAME}"
echo ""

# ── Install nginx ingress controller ─────────────────────────────────────────
log "Installing nginx ingress controller..."
curl -s "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-${INGRESS_VERSION}/deploy/static/provider/cloud/deploy.yaml" \
  | sed 's|@sha256:[a-f0-9]*||g' \
  | kubectl apply -f - >/dev/null
ok "Ingress controller installed"
echo ""

# ── Wait for ingress controller ready ────────────────────────────────────────
log "Waiting for ingress controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
ok "Ingress controller ready"
echo ""

# ── Install k6 Operator ───────────────────────────────────────────────────────
log "Installing k6 Operator..."
curl -s "https://raw.githubusercontent.com/grafana/k6-operator/main/bundle.yaml" \
  | kubectl apply -f - >/dev/null
log "Waiting for k6 Operator to be ready..."
kubectl wait --namespace k6-operator-system \
  --for=condition=available deployment/k6-operator-controller-manager \
  --timeout=120s || true
ok "k6 Operator ready"
echo ""

# ── Pull and mirror infra images (avoids Docker Hub rate limits) ─────────────
log "Pulling infra images..."
for img in "influxdb:2.7" "grafana/grafana:12.2.0" "grafana/grafana-image-renderer:latest"; do
  echo -ne "  ${DIM}pulling ${img}...${NC}\r"
  docker pull --platform linux/amd64 "$img" -q
  # mirror to local registry
  case "$img" in
    */*)  local_tag="localhost:${REG_PORT}/${img}" ;;
    *)    local_tag="localhost:${REG_PORT}/library/${img}" ;;
  esac
  docker tag "$img" "$local_tag" 2>/dev/null || true
  docker push "$local_tag" -q >/dev/null 2>&1
  echo -e "  ${GREEN}✓${NC} ${img}                    "
done
ok "Infra images ready in local registry"
echo ""

# ── Build and push backend ───────────────────────────────────────────────────
log "Building perfstack-backend:latest (amd64)..."
docker build --platform linux/amd64 -t perfstack-backend:latest ./backend
docker tag perfstack-backend:latest localhost:${REG_PORT}/library/perfstack-backend:latest
docker push localhost:${REG_PORT}/library/perfstack-backend:latest
ok "Backend image built and pushed"
echo ""

# ── Build and push frontend ──────────────────────────────────────────────────
log "Building perfstack-frontend:latest (amd64)..."
docker build --platform linux/amd64 -t perfstack-frontend:latest ./frontend
docker tag perfstack-frontend:latest localhost:${REG_PORT}/library/perfstack-frontend:latest
docker push localhost:${REG_PORT}/library/perfstack-frontend:latest
ok "Frontend image built and pushed"
echo ""

# ── Build and push k6 (custom xk6-output-influxdb) ───────────────────────────
log "Building perfstack-k6:latest (amd64, xk6-output-influxdb)..."
docker build --platform linux/amd64 -t perfstack-k6:latest ./k6
docker tag perfstack-k6:latest localhost:${REG_PORT}/library/perfstack-k6:latest
docker push localhost:${REG_PORT}/library/perfstack-k6:latest
ok "k6 image built and pushed"
echo ""

# ── Apply Kubernetes manifests ───────────────────────────────────────────────
log "Applying Kubernetes manifests..."
for f in k8s/namespace.yaml k8s/rbac.yaml k8s/backend-pvc.yaml k8s/influxdb.yaml k8s/grafana-config.yaml k8s/grafana.yaml k8s/backend.yaml k8s/frontend.yaml k8s/ingress.yaml; do
  kubectl apply -f $f >/dev/null
done
ok "All manifests applied"
echo ""

# ── Restart deployments ──────────────────────────────────────────────────────
log "Restarting deployments..."
for deploy in grafana grafana-renderer backend frontend; do
  kubectl rollout restart deployment/$deploy -n $NS >/dev/null || true
done
ok "Rollouts triggered"
echo ""

# ── Wait for deployments ─────────────────────────────────────────────────────
log "Waiting for deployments to be ready..."
for deploy in influxdb grafana grafana-renderer backend frontend; do
  kubectl rollout status deployment/$deploy -n $NS --timeout=3m >/dev/null
  ok "$deploy is ready"
done
echo ""

# ── Done ─────────────────────────────────────────────────────────────────────
echo -e "${GREEN}🚀 PerfStack is up!${NC}"
echo "Frontend -> http://localhost"
echo "Grafana  -> http://localhost/grafana   (admin / admin)"
echo "Backend  -> http://localhost/api/docs"