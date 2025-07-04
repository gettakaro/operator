#!/bin/bash
set -e

CLUSTER_NAME="takaro"
REGISTRY_NAME="kind-registry"
REGISTRY_PORT="5001"

echo "🚀 Setting up kind cluster for Takaro operator development..."

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    echo "❌ kind is not installed. Please install it first: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if cluster already exists
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "✅ Kind cluster '${CLUSTER_NAME}' already exists"
else
    # Create kind cluster configuration
    cat <<EOF > /tmp/kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ${CLUSTER_NAME}
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
containerdConfigPatches:
- |-
  [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:${REGISTRY_PORT}"]
    endpoint = ["http://${REGISTRY_NAME}:5000"]
EOF

    # Create the cluster
    echo "📦 Creating kind cluster..."
    kind create cluster --config=/tmp/kind-config.yaml
fi

# Create local Docker registry if it doesn't exist
if ! docker ps -a | grep -q "${REGISTRY_NAME}"; then
    echo "📦 Creating local Docker registry..."
    docker run -d --restart=always -p "127.0.0.1:${REGISTRY_PORT}:5000" --name "${REGISTRY_NAME}" registry:2
else
    echo "✅ Local Docker registry already exists"
fi

# Connect registry to kind network if not already connected
if ! docker network inspect kind | grep -q "${REGISTRY_NAME}"; then
    echo "🔗 Connecting registry to kind network..."
    docker network connect kind "${REGISTRY_NAME}" || true
fi

# Document the local registry
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:${REGISTRY_PORT}"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
EOF

echo "✅ Kind cluster setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Copy .env.example to .env and add your Takaro API credentials"
echo "2. Run 'tilt up' to start the development environment"
echo "3. Press 'space' to open the Tilt UI in your browser"
echo ""
echo "🔧 Useful commands:"
echo "- kubectl config use-context kind-${CLUSTER_NAME}"
echo "- kubectl get nodes"
echo "- docker exec -it ${CLUSTER_NAME}-control-plane bash"
echo ""