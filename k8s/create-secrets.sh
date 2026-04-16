#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# create-secrets.sh  —  One-time setup: create the shared K8s secret.
# Run this on the EC2 where kubectl is configured.
# This script is intentionally NOT committed with real values.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

NAMESPACE="perfstack"
SECRET_NAME="gsa-shared-secrets"

# Generate a random key if not provided via env
INTERNAL_API_KEY="${INTERNAL_API_KEY:-$(openssl rand -hex 32)}"

echo "Creating secret '${SECRET_NAME}' in namespace '${NAMESPACE}'..."

kubectl create secret generic "${SECRET_NAME}" \
  --namespace "${NAMESPACE}" \
  --from-literal=INTERNAL_API_KEY="${INTERNAL_API_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "Done. Save the key below — you will need it if you ever recreate the cluster."
echo ""
echo "  INTERNAL_API_KEY=${INTERNAL_API_KEY}"
echo ""
echo "To verify:"
echo "  kubectl get secret ${SECRET_NAME} -n ${NAMESPACE} -o jsonpath='{.data.INTERNAL_API_KEY}' | base64 -d"
