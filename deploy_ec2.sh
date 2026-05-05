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

# ── Safety wrapper — every kubectl call is pinned to the k3d context ──────────
K3D_CTX="k3d-${CLUSTER_NAME}"
kube() { kubectl --context "${K3D_CTX}" "$@"; }

assert_k3d_context() {
  local active
  active=$(kubectl config current-context 2>/dev/null || echo "none")
  if [[ "$active" != "${K3D_CTX}" ]]; then
    warn "kubectl context is '$active' — but all commands are pinned to '${K3D_CTX}' via --context flag."
  fi
  if ! k3d cluster list 2>/dev/null | grep -q "^${CLUSTER_NAME}[[:space:]]"; then
    err "k3d cluster '${CLUSTER_NAME}' not found. Cannot continue."
  fi
}

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
  "gitea/gitea:1.22"
  "docker:27-cli"
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
GITEA_DIR="${HOME}/.perfstack/gitea"
log "Ensuring persistent data dirs..."
mkdir -p "${PERSIST_DIR}" "${GITEA_DIR}"
ok "Persistent data dirs ready"

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
  --volume "${GITEA_DIR}:/host-data/gitea@all" \
  --volume "/var/run/docker.sock:/var/run/docker.sock@all" \
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
  | kube apply -f - >/dev/null 2>&1

log "Waiting for ingress controller pod..."
kube wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=300s >/dev/null 2>&1
ok "Ingress controller ready"
echo ""

# ── Install k6 Operator ───────────────────────────────────────────────────────
log "Installing k6 Operator..."
curl -s "https://raw.githubusercontent.com/grafana/k6-operator/main/bundle.yaml" \
  | kube apply -f - >/dev/null 2>&1
log "Waiting for k6 Operator to be ready..."
kube wait --namespace k6-operator-system \
  --for=condition=available deployment/k6-operator-controller-manager \
  --timeout=120s >/dev/null 2>&1 || true
ok "k6 Operator ready"
echo ""

# ── Docker cleanup (free disk before builds) ──────────────────────────────────
log "Pruning Docker to free disk space before builds..."
DISK_BEFORE=$(df -h / | awk 'NR==2{print $4}')
docker container prune -f >/dev/null 2>&1
docker image prune -f     >/dev/null 2>&1
docker builder prune -f   >/dev/null 2>&1
DISK_AFTER=$(df -h / | awk 'NR==2{print $4}')
ok "Docker pruned — free disk: ${DISK_BEFORE} → ${DISK_AFTER}"
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

# ── Public hostname (ALB takes priority over EC2 auto-detect) ────────────────
# Set ALB_HOST to your ALB DNS name to override EC2 metadata detection.
# Example: ALB_HOST="my-alb-123456.us-east-2.elb.amazonaws.com"
ALB_HOST="${ALB_HOST:-}"

log "Detecting public hostname..."
if [ -n "$ALB_HOST" ]; then
  PUBLIC_HOST="$ALB_HOST"
  ok "Public host (ALB): ${PUBLIC_HOST}"
else
  IMDS_TOKEN=$(curl -sf --max-time 3 -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
  if [ -n "$IMDS_TOKEN" ]; then
    PUBLIC_HOST=$(curl -sf --max-time 3 -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
      http://169.254.169.254/latest/meta-data/public-hostname 2>/dev/null \
      || curl -sf --max-time 3 -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
      http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
      || echo "localhost")
  else
    PUBLIC_HOST=$(curl -sf --max-time 5 https://checkip.amazonaws.com 2>/dev/null \
      || echo "localhost")
  fi
  ok "Public host (EC2): ${PUBLIC_HOST}"
fi
echo ""

# ── Safety gate: confirm k3d cluster is reachable before any apply ────────────
log "Verifying k3d cluster is reachable before applying manifests..."
assert_k3d_context
ok "k3d cluster '${CLUSTER_NAME}' reachable — context pinned to '${K3D_CTX}'"
echo ""

# ── Apply Kubernetes manifests ────────────────────────────────────────────────
log "Applying Kubernetes manifests..."
kube apply -f k8s/namespace.yaml          >/dev/null

# ── Shared secrets (persisted across cluster recreations) ─────────────────────
# The cluster is destroyed on each deploy, but ~/.perfstack/data survives.
# Load the existing key (preserves compatibility with deployed apps) or
# generate a new one on first run.
log "Setting up shared secrets..."
SECRET_FILE="${HOME}/.perfstack/data/internal_api_key"
if [ -f "$SECRET_FILE" ]; then
  INTERNAL_API_KEY=$(cat "$SECRET_FILE")
  ok "Loaded INTERNAL_API_KEY from ${SECRET_FILE}"
else
  INTERNAL_API_KEY=$(openssl rand -hex 32)
  echo "$INTERNAL_API_KEY" > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  ok "Generated new INTERNAL_API_KEY → saved to ${SECRET_FILE}"
fi
kube create secret generic gsa-shared-secrets \
  --namespace "$NS" \
  --from-literal=INTERNAL_API_KEY="$INTERNAL_API_KEY" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null
ok "Secret 'gsa-shared-secrets' ready in namespace '${NS}'"
echo ""

kube apply -f k8s/rbac.yaml               >/dev/null
kube apply -f k8s/backend-pvc.yaml        >/dev/null
kube apply -f k8s/influxdb.yaml           >/dev/null
kube apply -f k8s/grafana-config.yaml     >/dev/null
kube apply -f k8s/grafana.yaml            >/dev/null
kube apply -f k8s/backend.yaml            >/dev/null
kube set env deployment/backend -n $NS PUBLIC_HOST="${PUBLIC_HOST}" >/dev/null
kube apply -f k8s/frontend.yaml           >/dev/null
kube apply -f k8s/gitea-namespace.yaml    >/dev/null
kube apply -f k8s/gitea-pvc.yaml          >/dev/null
kube apply -f k8s/gitea.yaml              >/dev/null
kube apply -f k8s/ingress.yaml            >/dev/null
ok "All manifests applied"
echo ""

# ── Restart deployments to pick up new images / config changes ────────────────
log "Restarting deployments to apply latest images and config..."
for deploy in grafana grafana-renderer backend frontend; do
  kube rollout restart deployment/$deploy -n $NS >/dev/null 2>&1 || true
done
ok "Rollout restarts triggered"
echo ""

# ── Wait for app deployments ──────────────────────────────────────────────────
log "Waiting for deployments to be ready (timeout: 3 min)..."
for deploy in influxdb grafana grafana-renderer backend frontend; do
  echo -ne "  ${DIM}waiting for ${deploy}...${NC}"
  kube rollout status deployment/$deploy -n $NS --timeout=3m >/dev/null 2>&1
  echo -e "\r  ${GREEN}✓${NC} ${deploy} is ready           "
done
echo -ne "  ${DIM}waiting for gitea...${NC}"
kube rollout status deployment/gitea -n gitea --timeout=5m >/dev/null 2>&1
echo -e "\r  ${GREEN}✓${NC} gitea is ready           "
echo ""

# ── Bootstrap Gitea admin user (idempotent) ───────────────────────────────────
log "Bootstrapping Gitea admin user..."
kube exec -n gitea deployment/gitea -- \
  su-exec git gitea admin user create --admin \
  --username gsaadmin --password admin \
  --email admin@gsa.gov \
  --must-change-password=false >/dev/null 2>&1 \
  && ok "Gitea admin user created (admin / admin)" \
  || ok "Gitea admin user already exists"
echo ""

# ── Restart all DeployStack apps (images survive in registry) ────────────────
log "Restarting DeployStack apps from existing images..."
APPS=$(curl -sf http://localhost/api/deploy/apps 2>/dev/null || echo "[]")
APP_NAMES=$(echo "$APPS" | python3 -c "import sys,json; [print(a['name']) for a in json.load(sys.stdin)]" 2>/dev/null || true)
if [ -z "$APP_NAMES" ]; then
  dim "No apps registered — skipping"
else
  for app_name in $APP_NAMES; do
    APP_NS="app-${app_name}"
    # Propagate shared secret into the app namespace before restarting
    if kube get namespace "$APP_NS" >/dev/null 2>&1; then
      kube create secret generic gsa-shared-secrets \
        --namespace "$APP_NS" \
        --from-literal=INTERNAL_API_KEY="$INTERNAL_API_KEY" \
        --dry-run=client -o yaml | kube apply -f - >/dev/null 2>&1 || true
    fi
    echo -ne "  ${DIM}restarting ${app_name}...${NC}"
    curl -sf -X POST "http://localhost/api/deploy/apps/${app_name}/restart" >/dev/null 2>&1 \
      && echo -e "\r  ${GREEN}✓${NC} ${app_name} restarted           " \
      || echo -e "\r  ${AMBER}!${NC} ${app_name} restart failed      "
  done
fi
echo ""

# ── Done ─────────────────────────────────────────────────────────────────────
echo "  ══════════════════════════════════════════════════════"
echo -e "  ${GREEN}🚀 PerfStack is up!${NC}"
echo -e "  ${DIM}EC2 — Ingress on localhost:80${NC}"
echo "  ══════════════════════════════════════════════════════"
echo ""
echo -e "  ${BLUE}Frontend UI${NC}   ->  http://localhost"
echo -e "  ${BLUE}Grafana${NC}       ->  http://localhost/grafana   (admin / admin)"
echo -e "  ${BLUE}Gitea${NC}         ->  http://localhost/gitea     (gsaadmin / admin)"
echo -e "  ${BLUE}Backend API${NC}   ->  http://localhost/api/docs"
echo ""
_elapsed=$(( SECONDS - DEPLOY_START ))
echo -e "  ${DIM}⏱  Completed in $(( _elapsed / 60 ))m $(( _elapsed % 60 ))s${NC}"
echo ""
