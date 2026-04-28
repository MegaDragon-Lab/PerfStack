#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RBAC_SRC="$SCRIPT_DIR/backend/rbac.yaml"
NAMESPACE="perfstack"

pod=$(kubectl get pods -n "$NAMESPACE" -l app=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [[ -z "$pod" ]]; then
  echo "ERROR: no backend pod found in namespace '$NAMESPACE'" >&2
  exit 1
fi

kubectl cp "$RBAC_SRC" "$NAMESPACE/$pod:/data/rbac.yaml"
echo "rbac.yaml reloaded into $pod — changes take effect on next request (no restart needed)"
