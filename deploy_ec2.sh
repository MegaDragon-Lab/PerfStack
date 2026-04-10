#!/usr/bin/env bash
# PerfStack — Deploy script (EC2 / Linux)
set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
AMBER='\033[0;33m'
DIM='\033[2m'
NC='\033[0m'

DEPLOY_START=$SECONDS
CLUSTER_NAME="perfstack"
NS="perfstack"
INGRESS_VERSION="v1.10.1"
REG_NAME="perfstack-registry"
REG_PORT="5001"

log()  { echo -e "${BLUE}▶${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${AMBER}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
dim()  { echo -e "${DIM}  $1${NC}"; }

# Push a Docker image to the local registry under the correct mirror path.
# registry.k8s.io/foo/bar:tag  -> localhost:REG_PORT/foo/bar:tag
# docker.io/grafana/foo:tag    -> localhost:REG_PORT/grafana/foo:tag
# grafana/foo:tag (bare)       -> localhost:REG_PORT/grafana/foo:tag
# influxdb:1.8 (no slash)      -> localhost:REG_PORT/library/influxdb:1.8
push_to_local_registry() {
  local img="$1"
  local local_tag
  case "$img" in
    registry.k8s.io/*) local_tag="localhost:${REG_PORT}/${img#registry.k8s.io/}" ;;
    docker.io/*)        local_tag="localhost:${REG_PORT}/${img#docker.io/}" ;;
    */*)                local_tag="localhost:${REG_PORT}/${img}" ;;
    *)                  local_tag="localhost:${REG_PORT}/library/${img}" ;;
  esac
  docker tag "$img" "$local_tag" 2>/dev/null || true
  docker push "$local_tag" -q >/dev/null 2>&1
}

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
command -v docker  >/dev/null 2>&1 || err "Docker not found."
command -v k3d     >/dev/null 2>&1 || err "k3d not found."
command -v kubectl >/dev/null 2>&1 || err "kubectl not found."
docker info >/dev/null 2>&1         || err "Docker is not running."
ok "Preflight checks passed"
echo ""

# ── Pre-pull all images on HOST Docker ────────────────────────────────────────
log "Pre-pulling images (avoids rate limits inside cluster)..."

INGRESS_IMAGES=(
  "registry.k8s.io/ingress-nginx/controller:v1.10.1"
  "registry.k8s.io/ingress-nginx/kube-webhook-certgen:v1.4.1"
)
INFRA_IMAGES=(
  "influxdb:2.7"
  "grafana/grafana:12.2.0"
  "grafana/grafana-image-renderer:latest"
)

for img in "${INGRESS_IMAGES[@]}" "${INFRA_IMAGES[@]}"; do
  echo -ne "  ${DIM}pulling ${img}...${NC}\r"
  docker pull --platform linux/amd64 "$img" -q
  echo -e "  ${GREEN}✓${NC} pulled ${img}                    "
done
ok "All base images pre-pulled"
echo ""

# ── Create local registry ─────────────────────────────────────────────────────
log "Setting up local registry..."
if k3d registry list 2>/dev/null | grep -q "${REG_NAME}"; then
  ok "Registry 'k3d-${REG_NAME}' already exists"
else
  k3d registry create ${REG_NAME} --port ${REG_PORT} 2>&1 | grep -vE "^\s*$" || true
  ok "Registry created at localhost:${REG_PORT}"
fi
echo ""

# ── Push pre-pulled images to local registry ──────────────────────────────────
log "Pushing images to local registry..."
for img in "${INGRESS_IMAGES[@]}" "${INFRA_IMAGES[@]}"; do
  echo -ne "  ${DIM}pushing ${img}...${NC}\r"
  push_to_local_registry "$img"
  echo -e "  ${GREEN}✓${NC} pushed ${img}                    "
done
ok "All images available in local registry"
echo ""

# ── Write k3s registry mirrors config ────────────────────────────────────────
cat > /tmp/perfstack-registries.yaml << EOF
mirrors:
  "registry.k8s.io":
    endpoint:
      - "http://k3d-${REG_NAME}:5000"
  "docker.io":
    endpoint:
      - "http://k3d-${REG_NAME}:5000"
EOF

# ── Persistent data directory (survives cluster delete) ───────────────────────
PERSIST_DIR="${HOME}/.perfstack/data"
log "Ensuring persistent data dir: ${PERSIST_DIR}..."
mkdir -p "${PERSIST_DIR}"
ok "Persistent data dir ready"

# ── Create k3d cluster (always fresh) ────────────────────────────────────────
log "Deleting existing cluster (if any)..."
k3d cluster delete ${CLUSTER_NAME} 2>/dev/null && ok "Old cluster deleted" || true

log "Creating k3d cluster '${CLUSTER_NAME}'..."
k3d cluster create ${CLUSTER_NAME} \
  --port "80:80@loadbalancer" \
  --port "443:443@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0" \
  --agents 2 \
  --registry-use k3d-${REG_NAME}:${REG_PORT} \
  --registry-config /tmp/perfstack-registries.yaml \
  --volume "${PERSIST_DIR}:/host-data/perfstack@all" \
  --timeout 120s 2>&1 | grep -E "Cluster|error|Error" || true
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
  | kubectl apply -f - >/dev/null 2>&1

log "Waiting for ingress controller pod..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s >/dev/null 2>&1
ok "Ingress controller ready"
echo ""

# ── Install k6 Operator ───────────────────────────────────────────────────────
log "Installing k6 Operator..."
curl -s "https://raw.githubusercontent.com/grafana/k6-operator/main/bundle.yaml" \
  | kubectl apply -f - >/dev/null 2>&1
log "Waiting for k6 Operator to be ready..."
kubectl wait --namespace k6-operator-system \
  --for=condition=available deployment/k6-operator-controller-manager \
  --timeout=120s >/dev/null 2>&1 || true
ok "k6 Operator ready"
echo ""

# ── Build app images ──────────────────────────────────────────────────────────
log "Building perfstack-backend:latest..."
docker build --no-cache --platform linux/amd64 -t perfstack-backend:latest ./backend
ok "perfstack-backend:latest built"

log "Pushing perfstack-backend to local registry..."
docker tag perfstack-backend:latest localhost:${REG_PORT}/library/perfstack-backend:latest
docker push localhost:${REG_PORT}/library/perfstack-backend:latest
ok "Backend image pushed to registry"

log "Building perfstack-frontend:latest..."
docker build --no-cache --platform linux/amd64 -t perfstack-frontend:latest ./frontend
ok "perfstack-frontend:latest built"

log "Pushing perfstack-frontend to local registry..."
docker tag perfstack-frontend:latest localhost:${REG_PORT}/library/perfstack-frontend:latest
docker push localhost:${REG_PORT}/library/perfstack-frontend:latest
ok "Frontend image pushed to registry"

log "Building perfstack-k6:latest (custom k6 + xk6-output-influxdb)..."
docker build --no-cache --platform linux/amd64 -t perfstack-k6:latest ./k6
ok "perfstack-k6:latest built"

log "Pushing perfstack-k6 to local registry..."
docker tag perfstack-k6:latest localhost:${REG_PORT}/library/perfstack-k6:latest
docker push localhost:${REG_PORT}/library/perfstack-k6:latest
ok "k6 image pushed to registry"
echo ""

# ── Apply Kubernetes manifests ────────────────────────────────────────────────
log "Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml       >/dev/null
kubectl apply -f k8s/rbac.yaml            >/dev/null
kubectl apply -f k8s/backend-pvc.yaml     >/dev/null
kubectl apply -f k8s/influxdb.yaml        >/dev/null
kubectl apply -f k8s/grafana-config.yaml  >/dev/null
kubectl apply -f k8s/grafana.yaml         >/dev/null
kubectl apply -f k8s/backend.yaml         >/dev/null
kubectl apply -f k8s/frontend.yaml        >/dev/null
kubectl apply -f k8s/ingress.yaml         >/dev/null
ok "All manifests applied"
echo ""

# ── Restart deployments to pick up new images / config changes ────────────────
log "Restarting deployments to apply latest images and config..."
for deploy in grafana grafana-renderer backend frontend; do
  kubectl rollout restart deployment/$deploy -n $NS >/dev/null 2>&1 || true
done
ok "Rollout restarts triggered"
echo ""

# ── Wait for app deployments ──────────────────────────────────────────────────
log "Waiting for deployments to be ready (timeout: 3 min)..."
for deploy in influxdb grafana grafana-renderer backend frontend; do
  echo -ne "  ${DIM}waiting for ${deploy}...${NC}"
  kubectl rollout status deployment/$deploy -n $NS --timeout=3m >/dev/null 2>&1
  echo -e "\r  ${GREEN}✓${NC} ${deploy} is ready           "
done
echo ""

# ── Done ─────────────────────────────────────────────────────────────────────
echo "  ══════════════════════════════════════════════════════"
echo -e "  ${GREEN}🚀 PerfStack is up!${NC}"
echo -e "  ${DIM}EC2 — Ingress on localhost:80${NC}"
echo "  ══════════════════════════════════════════════════════"
echo ""
echo -e "  ${BLUE}Frontend UI${NC}   ->  http://localhost"
echo -e "  ${BLUE}Grafana${NC}       ->  http://localhost/grafana   (admin / admin)"
echo -e "  ${BLUE}Backend API${NC}   ->  http://localhost/api/docs"
echo ""
_elapsed=$(( SECONDS - DEPLOY_START ))
echo -e "  ${DIM}⏱  Completed in $(( _elapsed / 60 ))m $(( _elapsed % 60 ))s${NC}"
echo ""
