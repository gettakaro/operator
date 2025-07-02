#!/bin/bash

set -e

CLUSTER_NAME="takaro-operator-dev"

echo "🧹 Tearing down Kind cluster for Takaro Operator..."

# Check if Kind is installed
if ! command -v kind &> /dev/null; then
    echo "❌ Kind is not installed."
    exit 1
fi

# Check if cluster exists
if ! kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "⚠️  Cluster '${CLUSTER_NAME}' does not exist."
    echo "Available clusters:"
    kind get clusters
    exit 0
fi

# Ask for confirmation
echo "⚠️  This will delete the entire Kind cluster '${CLUSTER_NAME}' and all its resources."
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Teardown cancelled."
    exit 0
fi

# Delete the cluster
echo "🗑️  Deleting Kind cluster '${CLUSTER_NAME}'..."
kind delete cluster --name="${CLUSTER_NAME}"

# Clean up any leftover contexts (ignore errors)
kubectl config delete-context "kind-${CLUSTER_NAME}" 2>/dev/null || true

echo ""
echo "✅ Kind cluster teardown complete!"
echo ""
echo "📋 Cleanup Summary:"
echo "   - Cluster '${CLUSTER_NAME}' deleted"
echo "   - kubectl context removed"
echo "   - All operator resources destroyed"
echo ""
echo "🔧 To setup again: npm run cluster:up"
echo ""