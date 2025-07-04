# Local Development Setup

This guide walks you through setting up a local development environment for the Takaro Kubernetes Operator using Kind and Tilt.

## Prerequisites

- Docker
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [Tilt](https://docs.tilt.dev/install.html)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Node.js 18+
- A Takaro API token from your external Takaro instance

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your TAKARO_API_URL and TAKARO_API_TOKEN
   ```

3. **Setup Kind cluster:**
   ```bash
   ./scripts/setup-kind.sh
   ```

4. **Start Tilt:**
   ```bash
   tilt up
   ```

5. **Open Tilt UI:**
   Press `space` or navigate to http://localhost:10350

## What Tilt Does

When you run `tilt up`, Tilt will:

1. Build the operator Docker image with hot reload support
2. Create the `takaro-system` namespace
3. Create a secret with your Takaro API credentials
4. Apply the Domain CRD
5. Apply RBAC resources (ServiceAccount, Role, RoleBinding)
6. Deploy the operator
7. Set up port forwarding for:
   - HTTP server: localhost:8080
   - Metrics: localhost:9090

## Development Workflow

### Making Code Changes

1. Edit TypeScript files in the `src/` directory
2. Tilt automatically detects changes and rebuilds the container
3. The operator pod is updated with live reload
4. Check logs in the Tilt UI or with: `kubectl logs -n takaro-system deployment/takaro-operator -f`

### Testing Domain Creation

1. Use the Tilt UI "create-sample-domain" button, or
2. Apply an example manually:
   ```bash
   kubectl apply -f examples/domains/simple-domain.yaml
   ```

3. Check domain status:
   ```bash
   kubectl get domains -n takaro-system
   kubectl describe domain simple-domain -n takaro-system
   ```

### Running Tests

Click the "run-tests" button in Tilt UI or run:
```bash
npm test
```

### Linting and Type Checking

Use the Tilt UI buttons or run:
```bash
npm run lint
npm run typecheck
```

## Troubleshooting

### Tilt won't start
- Ensure Kind cluster is running: `kubectl config get-contexts`
- Check Docker is running: `docker ps`
- Verify .env file has valid credentials

### Operator crashes
- Check logs: `kubectl logs -n takaro-system deployment/takaro-operator`
- Verify Takaro API credentials are correct
- Check network connectivity to external Takaro instance

### Domain creation fails
- Check operator logs for error messages
- Verify RBAC permissions: `kubectl auth can-i --list --as=system:serviceaccount:takaro-system:takaro-operator`
- Check secrets were created: `kubectl get secrets -n takaro-system`

## Cleanup

To tear down the environment:
```bash
# Stop Tilt (Ctrl+C or from UI)
# Then run:
./scripts/teardown-kind.sh
```

## Architecture

The local setup consists of:
- **Kind cluster**: Single-node Kubernetes cluster
- **Local registry**: Docker registry for fast image pushes
- **Tilt**: Orchestrates building, deploying, and monitoring
- **Hot reload**: TypeScript changes trigger automatic rebuilds

## Environment Variables

Key environment variables used:
- `TAKARO_API_URL`: URL of external Takaro instance
- `TAKARO_API_TOKEN`: Authentication token for Takaro API
- `NAMESPACE`: Kubernetes namespace for operator
- `LOG_LEVEL`: Logging verbosity (debug, info, warn, error)
- `RECONCILE_INTERVAL`: How often to reconcile resources (ms)