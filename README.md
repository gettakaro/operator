# Takaro Kubernetes Operator

A Kubernetes operator for managing Takaro game server environments through Custom Resource Definitions (CRDs).

## Overview

This operator automates the management of:
- **Domains**: Takaro domains with registration tokens and root user credentials
- **Mock Servers**: Mock game server deployments with simulation capabilities
- **Users**: User provisioning with role assignments

## Prerequisites

- Node.js 18+ (for built-in test runner support)
- Kubernetes cluster (Kind recommended for local development)
- Access to a Takaro API instance

## Installation

```bash
# Install dependencies
npm install

# Build the operator
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

## Configuration

The operator is configured via environment variables:

- `TAKARO_API_URL`: Base URL for the Takaro API
- `TAKARO_API_TOKEN`: Admin API token for authentication
- `KUBERNETES_NAMESPACE`: Namespace for operator deployment (default: takaro-system)
- `LOG_LEVEL`: Logging level (default: info)

## Development

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