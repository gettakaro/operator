## Tasks

- [x] 1.0 Set up operator foundation and basic CRD structure (except Kind cluster setup)
  - [x] 1.1 Initialize Node.js project with TypeScript configuration and required dependencies
  - [x] 1.2 Create basic operator structure with Express.js health endpoint and K8s client initialization
  - [x] 1.3 Define Domain CRD schema with TypeScript types and OpenAPI validation
  - [ ] 1.4 Set up Kind cluster for local development and create test namespace
  - [x] 1.5 Implement basic reconciliation loop structure with controller registration
  - [x] 1.6 Add configuration management for API endpoints and credentials via environment variables

- [x] 2.0 Implement Domain CRD with Takaro API integration
  - [x] 2.1 [depends on: 1.0] Create Takaro client service wrapper using @takaro/apiclient
  - [x] 2.2 [depends on: 2.1] Implement domain creation logic with externalReferenceId tracking
  - [x] 2.3 [depends on: 2.2] Add secret creation for registration token and root user credentials
  - [x] 2.4 [depends on: 2.2] Implement domain update reconciliation (limits, maintenance mode)
  - [x] 2.5 [depends on: 2.2] Add domain deletion with proper cleanup in Takaro
  - [x] 2.6 [depends on: 2.1] Implement status reporting with conditions (Ready, Error, Synced)
  - [x] 2.7 [depends on: 2.6] Add integration tests for domain lifecycle operations

- [ ] 3.0 Implement MockServer CRD with Kubernetes deployment creation
  - [ ] 3.1 [depends on: 1.3] Define MockServer CRD schema with simulation configuration fields
  - [ ] 3.2 [depends on: 2.0] Implement domain reference resolution (both CRD ref and externalReferenceId)
  - [ ] 3.3 [depends on: 3.2] Create deployment generation logic with proper environment variables
  - [ ] 3.4 [depends on: 3.3] Add Redis connection configuration injection
  - [ ] 3.5 [depends on: 3.3] Implement resource limits/requests from CRD specification
  - [ ] 3.6 [depends on: 3.2] Set up ownerReferences for automatic cleanup when domain is deleted
  - [ ] 3.7 [depends on: 3.3] Add deployment status monitoring and CRD status updates
  - [ ] 3.8 [depends on: 3.7] Create integration tests for MockServer deployment scenarios

- [ ] 4.0 Implement User CRD with role management
  - [ ] 4.1 [depends on: 1.3] Define User CRD schema with role assignment support
  - [ ] 4.2 [depends on: 2.0] Implement user creation via Takaro API with domain context
  - [ ] 4.3 [depends on: 4.2] Add password generation for users without specified passwords
  - [ ] 4.4 [depends on: 4.2] Implement role assignment during user creation
  - [ ] 4.5 [depends on: 4.2] Add user deletion handling with Takaro API
  - [ ] 4.6 [depends on: 4.2] Implement domain-specific token refresh logic (24-day validity)
  - [ ] 4.7 [depends on: 4.6] Add integration tests for user provisioning workflows

- [ ] 5.0 Add monitoring, metrics, and error handling
  - [ ] 5.1 [depends on: 2.0, 3.0, 4.0] Set up Prometheus metrics endpoint with express-prometheus-middleware
  - [ ] 5.2 [depends on: 5.1] Implement reconciliation metrics (success/failure rates, latencies)
  - [ ] 5.3 [depends on: 5.1] Add resource state metrics across namespaces
  - [ ] 5.4 [depends on: 2.0] Implement exponential backoff for failed reconciliations
  - [ ] 5.5 [depends on: 5.4] Add partial failure handling with detailed status conditions
  - [ ] 5.6 Create operational runbook documentation with common troubleshooting steps

- [ ] 6.0 Create Helm chart and integration tests
  - [ ] 6.1 [depends on: 1.0] Create basic Helm chart structure with templates
  - [ ] 6.2 [depends on: 6.1] Add Bitnami Redis as optional dependency in Chart.yaml
  - [ ] 6.3 [depends on: 6.1] Create RBAC templates for multi-namespace operation
  - [ ] 6.4 [depends on: 6.1] Add CRD installation templates with proper versioning
  - [ ] 6.5 [depends on: 6.1] Create configurable values.yaml with environment variables
  - [ ] 6.6 [depends on: 5.0] Add Prometheus ServiceMonitor template for metrics scraping
  - [ ] 6.7 [depends on: 2.7, 3.8, 4.7] Create end-to-end test for complete environment provisioning
  - [ ] 6.8 Create example manifests demonstrating various use cases
  - [ ] 6.9 Add helm chart testing with ct (chart-testing) tool

## Relevant Files

- `package.json` - Node.js project configuration with dependencies and scripts ✓
- `tsconfig.json` - TypeScript compiler configuration ✓
- `.eslintrc.json` - ESLint configuration for code quality ✓
- `.prettierrc.json` - Prettier configuration for code formatting ✓
- `nodemon.json` - Nodemon configuration for development auto-reload ✓
- `.gitignore` - Git ignore patterns
- `.env.example` - Example environment variables documentation
- `README.md` - Project documentation and setup instructions ✓
- `src/index.ts` - Main operator entry point with Express server, health endpoints, and K8s client setup ✓
- `src/controllers/base-controller.ts` - Abstract base controller with watch and reconciliation loop ✓
- `src/controllers/domain-controller.ts` - Domain CRD reconciliation logic and Takaro API integration ✓
- `src/controllers/registry.ts` - Controller registry for managing multiple controllers ✓
- `src/controllers/mockserver-controller.ts` - MockServer CRD reconciliation and deployment management
- `src/controllers/user-controller.ts` - User CRD reconciliation and user provisioning logic
- `src/apis/v1/domain.ts` - Domain CRD TypeScript definitions and schema ✓
- `src/apis/v1/mockserver.ts` - MockServer CRD TypeScript definitions and schema
- `src/apis/v1/user.ts` - User CRD TypeScript definitions and schema
- `src/services/takaro-client.ts` - Wrapper service for @takaro/apiclient with error handling ✓
- `src/services/kubernetes-service.ts` - Helper service for K8s resource management
- `src/utils/status-updater.ts` - Utility for updating CRD status conditions ✓
- `src/utils/metrics.ts` - Prometheus metrics configuration and helpers
- `src/config/index.ts` - Configuration management for environment variables with Zod validation ✓
- `helm/takaro-operator/Chart.yaml` - Helm chart definition
- `helm/takaro-operator/values.yaml` - Default Helm values with Redis dependency
- `helm/takaro-operator/templates/deployment.yaml` - Operator deployment manifest
- `helm/takaro-operator/templates/rbac.yaml` - RBAC rules for multi-namespace access
- `helm/takaro-operator/templates/crds/` - CRD installation templates
- `test/integration/domain-lifecycle.test.ts` - Domain CRD integration tests ✓
- `test/integration/mockserver-lifecycle.test.ts` - MockServer CRD integration tests
- `test/integration/user-lifecycle.test.ts` - User CRD integration tests
- `test/e2e/full-environment.test.ts` - End-to-end test for complete environment setup
- `examples/domain-simple.yaml` - Simple domain example manifest
- `examples/full-environment.yaml` - Complete environment with domain, servers, and users

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `domain-controller.ts` and `domain-controller.test.ts` in the same directory).
- Use `npm test` to run all tests or `npm test -- path/to/test` for specific tests.
- Integration tests will require a running Kind cluster and external Takaro instance.