# Takaro Kubernetes Operator

A Kubernetes operator for managing Takaro game server environments through Custom Resource Definitions (CRDs).

## Overview

This operator automates the management of:
- **Domains**: Takaro domains with registration tokens and root user credentials
- **Mock Servers**: Mock game server deployments with simulation capabilities
- **Users**: User provisioning with role assignments

## Prerequisites

- Node.js 18+ (for built-in test runner support)
- Docker (for Kind cluster)
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) (for local Kubernetes development)
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) (Kubernetes CLI)
- Access to a Takaro API instance

## Quick Start

### 1. Setup Local Development Environment

```bash
# Install dependencies
npm install

# Create and start Kind cluster
npm run cluster:up

# Build the operator
npm run build

# Set environment variables
export TAKARO_API_TOKEN="your-takaro-api-token"
export TAKARO_API_URL="https://api.takaro.dev"

# Start development server
npm run dev
```

### 2. Verify Setup

```bash
# Check cluster status
npm run cluster:status

# Check operator health
curl http://localhost:3000/health

# Check operator readiness
curl http://localhost:3000/ready
```

### 3. Clean Up

```bash
# Stop the operator (Ctrl+C)
# Tear down the Kind cluster
npm run cluster:down
```

## Configuration

The operator uses environment variables for configuration. Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
# Edit .env with your configuration
```

### Required Configuration

- `TAKARO_API_TOKEN`: Takaro API token for authentication (generate from Takaro dashboard)

### Configuration Categories

#### Basic Settings
- `PORT`: HTTP server port (default: 3000)
- `LOG_LEVEL`: Logging level - debug, info, warn, error (default: info)
- `NODE_ENV`: Environment - development, production, test (default: development)
- `KUBECONFIG`: Path to kubeconfig file (optional, defaults to in-cluster or ~/.kube/config)

#### Takaro API
- `TAKARO_API_URL`: Takaro API base URL (default: https://api.takaro.dev)
- `TAKARO_API_TIMEOUT`: Request timeout in ms (default: 30000)
- `TAKARO_API_RETRIES`: Number of retry attempts (default: 3)
- `TAKARO_API_RETRY_DELAY`: Delay between retries in ms (default: 1000)

#### Webhook Server (Optional)
- `WEBHOOK_ENABLED`: Enable admission webhooks (default: false)
- `WEBHOOK_PORT`: Webhook server port (default: 9443)
- `WEBHOOK_TLS_CERT`: Path to TLS certificate
- `WEBHOOK_TLS_KEY`: Path to TLS private key

#### Redis Cache (Optional)
- `REDIS_ENABLED`: Enable Redis for caching (default: false)
- `REDIS_URL`: Redis connection URL (or use HOST/PORT)
- `REDIS_HOST`: Redis hostname (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_PASSWORD`: Redis password
- `REDIS_TLS`: Enable TLS connection (default: false)

#### Metrics
- `METRICS_ENABLED`: Enable Prometheus metrics (default: true)
- `METRICS_PORT`: Metrics server port (default: 8080)
- `METRICS_PATH`: Metrics endpoint path (default: /metrics)

#### Operator Behavior
- `OPERATOR_NAMESPACE`: Namespace to watch (empty = all namespaces)
- `RECONCILE_INTERVAL`: Reconciliation interval in ms (default: 30000)
- `MAX_CONCURRENT_RECONCILES`: Max concurrent reconciliations (default: 3)
- `LEADER_ELECTION`: Enable leader election for HA (default: false)

#### Feature Flags
- `FEATURE_DOMAIN_CONTROLLER`: Enable Domain controller (default: true)
- `FEATURE_MOCKSERVER_CONTROLLER`: Enable MockServer controller (default: true)
- `FEATURE_USER_CONTROLLER`: Enable User controller (default: true)

See `.env.example` for complete documentation of all configuration options.

## Local Development

### Kind Cluster Management

The project includes scripts for managing a local Kind cluster:

```bash
# Create and configure Kind cluster with test namespace
npm run cluster:up

# Check cluster status and connectivity
npm run cluster:status

# Delete the Kind cluster and cleanup
npm run cluster:down
```

The Kind cluster includes:
- Control plane and worker node
- `takaro-operator-system` namespace
- RBAC configuration for operator testing
- Port forwarding for webhooks (if needed)

### Development Workflow

```bash
# Run linting
npm run lint

# Format code
npm run format

# Type checking
npm run typecheck

# Start development server with auto-reload
npm run dev
```

### Testing Against Local Cluster

Once you have the Kind cluster running:

1. **Start the operator**: `npm run dev`
2. **Apply CRDs**: Custom resources will be applied automatically (future task)
3. **Test Domain creation**: Create test Domain resources
4. **Monitor logs**: Watch operator logs for reconciliation events

### File Structure

```
├── src/
│   ├── apis/v1/          # CRD TypeScript definitions
│   ├── config/           # Configuration management
│   ├── controllers/      # Reconciliation logic (future)
│   ├── services/         # External service integrations (future)
│   └── utils/            # Utilities and helpers (future)
├── scripts/              # Development scripts
├── helm/                 # Helm chart (future)
├── examples/             # Example manifests (future)
└── test/                 # Test files (future)
```

## Testing

Tests use the built-in Node.js test runner:

```bash
# Run all tests
npm test

# Run specific test file
node --loader tsx --test src/path/to/test.test.ts
```

## License

MIT