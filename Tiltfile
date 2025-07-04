# Load environment variables from .env file if it exists
load('ext://dotenv', 'dotenv')
dotenv()

# Allow running against kind cluster
allow_k8s_contexts('kind-takaro')

# Create namespace if it doesn't exist
k8s_yaml(blob('''
apiVersion: v1
kind: Namespace
metadata:
  name: takaro-system
'''))

# Create secret for Takaro API credentials
# These values come from environment variables
takaro_api_url = os.environ.get('TAKARO_API_URL', 'https://api.takaro.dev')
takaro_api_token = os.environ.get('TAKARO_API_TOKEN', '')

if not takaro_api_token:
    fail('TAKARO_API_TOKEN environment variable must be set. Please create a .env file with your credentials.')

k8s_yaml(blob('''
apiVersion: v1
kind: Secret
metadata:
  name: takaro-operator-config
  namespace: takaro-system
type: Opaque
stringData:
  api-url: "{}"
  api-token: "{}"
'''.format(takaro_api_url, takaro_api_token)))

# Build the operator image with live updates
docker_build(
    'takaro-operator',
    '.',
    dockerfile='Dockerfile',
    target='development',
    live_update=[
        # Sync TypeScript source files
        sync('./src', '/app/src'),
        # Sync package files and reinstall if changed
        sync('./package.json', '/app/package.json'),
        sync('./package-lock.json', '/app/package-lock.json'),
        run('cd /app && npm ci', trigger=['./package.json', './package-lock.json']),
    ]
)

# Apply CRDs
k8s_yaml('./config/crd/domain-simple.yaml')

# Apply RBAC
k8s_yaml([
    './config/rbac/service_account.yaml',
    './config/rbac/role.yaml',
    './config/rbac/role_binding.yaml'
])

# Deploy the operator
k8s_yaml('./config/manager/deployment.yaml')

# Configure the operator deployment
k8s_resource(
    'takaro-operator',
    port_forwards=[
        '21080:21080',  # HTTP server
        '21090:21090'   # Metrics
    ],
    labels=['operator']
)

# Create a local resource for running tests
local_resource(
    'run-tests',
    'npm test',
    deps=['./src', './test'],
    labels=['tests'],
    auto_init=False
)

# Create a local resource for linting
local_resource(
    'lint',
    'npm run lint',
    deps=['./src'],
    labels=['quality'],
    auto_init=False
)

# Create a local resource for type checking
local_resource(
    'typecheck',
    'npm run typecheck',
    deps=['./src'],
    labels=['quality'],
    auto_init=False
)

# Button to apply a sample domain
local_resource(
    'create-sample-domain',
    '''kubectl apply -f - <<EOF
apiVersion: takaro.io/v1
kind: Domain
metadata:
  name: sample-domain
  namespace: takaro-system
spec:
  name: sample-domain
  limits:
    maxPlayers: 100
    maxGameServers: 10
    maxUsers: 50
  settings:
    maintenanceMode: false
    publiclyVisible: true
    allowRegistration: true
EOF''',
    labels=['samples'],
    auto_init=False
)

# Print helpful information
print("""
Takaro Operator Development Environment

Useful commands:
- Press 'b' to open the Tilt UI in your browser
- kubectl get domains -n takaro-system
- kubectl logs -n takaro-system deployment/takaro-operator -f
- Operator HTTP: http://localhost:21080
- Operator Metrics: http://localhost:21090

To create a sample domain, click the 'create-sample-domain' button in the Tilt UI.
""")