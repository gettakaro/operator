# Product Requirements Document: Takaro Kubernetes Operator

## Introduction/Overview

The Takaro Kubernetes Operator is a Node.js-based Kubernetes operator that automates the management of Takaro game server environments through Custom Resource Definitions (CRDs). It integrates with the Takaro API to handle domain creation, mock game server deployments, and user provisioning for development, testing, and CI/CD environments.

**Problem Statement**: Currently, setting up Takaro test environments requires manual API calls and configuration. This operator automates the entire process, making it easy for DevOps engineers to provision complete game server environments through Kubernetes-native resources.

**Goal**: Provide a declarative, Kubernetes-native way to manage Takaro domains, mock game servers, and users for testing and development environments.

## Goals

1. **Automate Environment Provisioning**: Eliminate manual steps in creating Takaro test environments
2. **Kubernetes-Native Management**: Use CRDs for declarative resource management with proper status reporting
3. **Multi-Tenant Support**: Handle multiple isolated domains across different namespaces
4. **Development Workflow Integration**: Enable seamless integration with CI/CD pipelines and developer workflows
5. **Resource Lifecycle Management**: Provide complete lifecycle management including cleanup and error handling

## User Stories

1. **As a DevOps engineer**, I want to create a complete Takaro test environment by applying a single YAML manifest, so that I can quickly provision environments for testing.

2. **As a developer**, I want to spin up mock game servers with specific configurations for performance testing, so that I can validate game server behavior under different conditions.

3. **As a CI/CD pipeline**, I want to automatically provision and tear down Takaro environments during testing phases, so that tests run in isolated, clean environments.

4. **As a platform team**, I want to track the status of all Takaro resources across multiple namespaces, so that I can monitor environment health and troubleshoot issues.

5. **As a test engineer**, I want to create domains with pre-configured users and roles, so that I can immediately start testing user interactions without manual setup.

## Functional Requirements

### Core Operator Requirements

1. **The operator MUST be implemented in Node.js** using the @takaro/apiclient for Takaro API interactions
2. **The operator MUST support multi-namespace operation** across a Kubernetes cluster
3. **The operator MUST implement proper reconciliation loops** with exponential backoff for failed operations
4. **The operator MUST report resource status** through CRD status fields (ready, error, pending)
5. **The operator MUST support configuration** via environment variables and Kubernetes secrets for API endpoints and authentication

### Domain CRD Requirements

6. **The operator MUST provide a Domain CRD** that creates domains in Takaro with the following specifications:
   - Required fields: name, takaroApiUrl
   - Optional fields: domainLimits (maxGameServers, maxUsers), maintenanceMode, description
   - The operator MUST use externalReferenceId to track domains in Takaro
   - The operator MUST store the generated registration token in a Kubernetes secret
   - The operator MUST create a root user and store credentials securely

7. **Domain lifecycle management**:
   - Creating a Domain CRD MUST create a new domain in Takaro via API
   - Updating a Domain CRD MUST update the corresponding domain settings
   - Deleting a Domain CRD MUST delete the domain from Takaro and clean up all related resources

### MockServer CRD Requirements

8. **The operator MUST provide a MockServer CRD** that deploys mock game servers with:
   - Required fields: name, plus either domainRef (reference to Domain CRD) OR externalReferenceId
   - Configuration fields: simulationFrequencies (chat, movement, connection, death, kill, item), totalPlayers, populationWeekendBoost
   - Redis configuration: shared Redis instance connection details
   - The operator MUST create Kubernetes Deployments for mock servers
   - The operator MUST inject the domain's registration token into mock server configuration
   - The operator MUST support both Domain CRD references (with ownerReferences) AND direct externalReferenceId for external domains

9. **MockServer deployment requirements**:
   - MUST create a Deployment with configurable replicas (default: 1)
   - MUST configure environment variables for all simulation parameters
   - MUST connect to shared Redis instance for state persistence
   - MUST support resource limits and requests configuration through CRD (user-defined per CR)

### User CRD Requirements

10. **The operator MUST provide a User CRD** for user provisioning with:
    - Required fields: name, email, domainRef
    - Optional fields: roles (list of pre-existing Takaro role names), password
    - The operator MUST create users directly (no email invitations)
    - The operator MUST assign specified roles during user creation
    - The operator MUST generate secure passwords if not provided

### Infrastructure Requirements

11. **Redis Integration**:
    - The operator MUST deploy a shared Redis instance for mock server state
    - Redis MUST use persistent volumes for data persistence
    - Redis configuration MUST be included in the operator's Helm chart as optional dependency

12. **Helm Chart**:
    - The operator MUST include a Helm chart for deployment
    - Chart MUST include optional Bitnami Redis dependency
    - Chart MUST support configuration of Takaro API endpoints and credentials
    - Chart MUST include proper RBAC configuration for multi-namespace operation

### Authentication and Security

13. **API Authentication**:
    - The operator MUST use admin client authentication via static secret
    - The operator MUST handle domain-specific token refresh (24-day validity)
    - API credentials MUST be stored in Kubernetes secrets
    - Multiple Takaro API endpoints MUST be supported via CRD configuration

## Non-Goals (Out of Scope)

1. **Custom Takaro module development** - Only pre-existing modules will be supported
2. **Real game server deployment** - Only mock servers are in scope
3. **User invitation workflows** - Only direct user creation
4. **Custom role creation** - Only assignment of existing Takaro roles
5. **Production game server management** - This operator is for testing/development only
6. **Takaro API server deployment** - Assumes external Takaro instance
7. **Network policies or advanced security configurations**
8. **GUI or web interface** - Kubernetes-native management only

## Design Considerations

### CRD Architecture
- **Separate CRDs**: Domain, MockServer, and User CRDs for flexible composition
- **Owner References**: MockServer and User CRDs reference Domain CRDs for automatic cleanup
- **Status Reporting**: All CRDs implement status subresources with conditions

### Resource Relationships
```yaml
Domain CRD → Creates Takaro Domain
├── MockServer CRD → References Domain → Creates K8s Deployment
└── User CRD → References Domain → Creates Takaro User
```

### Development Environment
- **Kind cluster** for local development and testing
- **External Takaro connection** for development (not docker-compose)
- **Integration test marking** via externalReferenceId for cleanup

## Technical Considerations

### Dependencies
- **@takaro/apiclient** for Takaro API interactions
- **Kubernetes client libraries** for CRD management
- **Bitnami Redis Helm chart** as optional dependency
- **Latest Kubernetes version** support

### Implementation Framework
- **Node.js operator framework** (custom implementation or existing framework like Kopf equivalent)
- **TypeScript** for type safety
- **Express.js** for health checks and metrics endpoints
- **Prometheus client** for exposing operator metrics

### Error Handling
- **Exponential backoff** for API failures
- **Partial failure reporting** in CRD status
- **Automatic reconciliation** with proper error states
- **Resource cleanup** on deletion with owner references

## Success Metrics

### Primary Success Criteria
1. **Domain Creation**: Domain CRD creation successfully creates domain in Takaro (measured by API response)
2. **Mock Server Deployment**: MockServer CRD creates running Kubernetes deployment that connects to Takaro
3. **User Provisioning**: User CRD creates authenticated users with correct roles in Takaro domain
4. **End-to-End Workflow**: Complete environment (Domain + MockServer + Users) deployable via single command

### Performance Metrics
1. **Reconciliation Time**: Domain creation completes within 30 seconds
2. **Mock Server Startup**: Mock servers become ready within 60 seconds
3. **Resource Cleanup**: Deleted CRDs clean up all related resources within 60 seconds
4. **Error Recovery**: Failed operations retry and recover automatically within 5 minutes

### Quality Metrics
1. **Status Accuracy**: CRD status accurately reflects actual resource state (>95% accuracy)
2. **Integration Test Coverage**: All CRD operations covered by automated tests
3. **Documentation Completeness**: All CRDs have complete API documentation and examples

## Implementation Notes

Based on clarified requirements:

1. **MockServer Domain Reference**: Both Domain CRD references (with ownerReferences) and direct externalReferenceId are supported for maximum flexibility.

2. **Resource Management**: Each CRD creator defines their own resource limits and requests. No namespace-wide enforcement.

3. **Prometheus Metrics**: The operator will expose metrics for:
   - CRD reconciliation success/failure rates
   - API call latencies and error rates
   - Resource creation/deletion counts
   - Current resource states across namespaces

4. **Redis State**: No backup functionality required. Redis is used for transient mock server state only.

5. **API Version**: Single Takaro API version support initially. Version compatibility can be added later if needed.

---

**Target Implementation Timeline**: 4-6 weeks for MVP covering core Domain and MockServer functionality, with User provisioning and Helm chart following in subsequent iterations.