#!/bin/bash

set -e

CLUSTER_NAME="takaro-operator-dev"
NAMESPACE="takaro-operator-system"
KIND_CONFIG="kind-config.yaml"

echo "🚀 Setting up Kind cluster for Takaro Operator development..."

# Check if Kind is installed
if ! command -v kind &> /dev/null; then
    echo "❌ Kind is not installed. Please install Kind first:"
    echo "   - macOS: brew install kind"
    echo "   - Linux: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed. Please install kubectl first:"
    echo "   - https://kubernetes.io/docs/tasks/tools/install-kubectl/"
    exit 1
fi

# Check if cluster already exists
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "⚠️  Cluster '${CLUSTER_NAME}' already exists."
    read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Deleting existing cluster..."
        kind delete cluster --name="${CLUSTER_NAME}"
    else
        echo "✅ Using existing cluster. Checking cluster status..."
        kubectl cluster-info --context="kind-${CLUSTER_NAME}"
        exit 0
    fi
fi

# Create the Kind cluster
echo "🏗️  Creating Kind cluster '${CLUSTER_NAME}'..."
kind create cluster --config="${KIND_CONFIG}" --wait=60s

# Verify cluster is ready
echo "🔍 Verifying cluster is ready..."
kubectl cluster-info --context="kind-${CLUSTER_NAME}"

# Create the operator namespace
echo "📦 Creating namespace '${NAMESPACE}'..."
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# Label the namespace
kubectl label namespace "${NAMESPACE}" name="${NAMESPACE}" --overwrite

# Create a service account for the operator (for future use)
echo "👤 Creating service account for operator..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: takaro-operator
  namespace: ${NAMESPACE}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: takaro-operator
rules:
- apiGroups: [""]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["apps"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["takaro.io"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["apiextensions.k8s.io"]
  resources: ["customresourcedefinitions"]
  verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: takaro-operator
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: takaro-operator
subjects:
- kind: ServiceAccount
  name: takaro-operator
  namespace: ${NAMESPACE}
EOF

# Set the kubectl context
kubectl config use-context "kind-${CLUSTER_NAME}"

echo ""
echo "✅ Kind cluster setup complete!"
echo ""
echo "📋 Cluster Information:"
echo "   - Cluster Name: ${CLUSTER_NAME}"
echo "   - Namespace: ${NAMESPACE}"
echo "   - Context: kind-${CLUSTER_NAME}"
echo ""
echo "🔧 Next Steps:"
echo "   1. Build and run the operator: npm run dev"
echo "   2. Apply Domain CRDs: kubectl apply -f examples/"
echo "   3. Check operator logs: kubectl logs -n ${NAMESPACE} -l app=takaro-operator"
echo ""
echo "🧹 To cleanup later: npm run cluster:down"
echo ""