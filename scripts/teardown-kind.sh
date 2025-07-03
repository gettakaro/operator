#!/bin/bash
set -e

CLUSTER_NAME="takaro"
REGISTRY_NAME="kind-registry"

echo "🧹 Tearing down kind cluster and local registry..."

# Delete kind cluster
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "📦 Deleting kind cluster..."
    kind delete cluster --name="${CLUSTER_NAME}"
else
    echo "✅ Kind cluster '${CLUSTER_NAME}' does not exist"
fi

# Stop and remove local registry
if docker ps -a | grep -q "${REGISTRY_NAME}"; then
    echo "📦 Removing local Docker registry..."
    docker stop "${REGISTRY_NAME}"
    docker rm "${REGISTRY_NAME}"
else
    echo "✅ Local Docker registry does not exist"
fi

echo "✅ Teardown complete!"