import { KubernetesObject, V1ObjectMeta } from '@kubernetes/client-node';

export interface DomainSpec {
  name: string;
  externalReference: string;
  gameServerId?: string;
  limits?: {
    maxGameServers?: number;
    maxUsers?: number;
  };
  settings?: {
    maintenanceMode?: boolean;
  };
  takaroConfig?: {
    apiUrl?: string;
    features?: string[];
  };
}

export interface DomainCondition {
  type: 'Ready' | 'Synced' | 'Error';
  status: 'True' | 'False' | 'Unknown';
  lastTransitionTime: string;
  reason: string;
  message: string;
}

export interface DomainStatus {
  phase?: 'Pending' | 'Creating' | 'Ready' | 'Error' | 'Deleting';
  externalReferenceId?: string;
  registrationToken?: string;
  rootUserCredentials?: {
    username: string;
    secretName: string;
  };
  conditions?: DomainCondition[];
  lastReconcileTime?: string;
  observedGeneration?: number;
}

export interface Domain extends KubernetesObject {
  apiVersion: 'takaro.io/v1';
  kind: 'Domain';
  metadata: V1ObjectMeta;
  spec: DomainSpec;
  status?: DomainStatus;
}

export const DomainCRDSchema = {
  apiVersion: 'apiextensions.k8s.io/v1',
  kind: 'CustomResourceDefinition',
  metadata: {
    name: 'domains.takaro.io',
  },
  spec: {
    group: 'takaro.io',
    versions: [
      {
        name: 'v1',
        served: true,
        storage: true,
        schema: {
          openAPIV3Schema: {
            type: 'object',
            properties: {
              apiVersion: {
                type: 'string',
                enum: ['takaro.io/v1'],
              },
              kind: {
                type: 'string',
                enum: ['Domain'],
              },
              metadata: {
                type: 'object',
              },
              spec: {
                type: 'object',
                required: ['name', 'externalReference'],
                properties: {
                  name: {
                    type: 'string',
                    description: 'The name of the domain to create in Takaro',
                    minLength: 1,
                    maxLength: 63,
                    pattern: '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$',
                  },
                  externalReference: {
                    type: 'string',
                    description: 'External reference ID for the domain in Takaro',
                    minLength: 1,
                    maxLength: 255,
                    pattern: '^[a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9]$',
                  },
                  gameServerId: {
                    type: 'string',
                    description: 'Optional game server ID to associate with the domain',
                  },
                  limits: {
                    type: 'object',
                    description: 'Resource limits for the domain',
                    properties: {
                      maxGameServers: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 100,
                        description: 'Maximum number of game servers allowed',
                      },
                      maxUsers: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 10000,
                        description: 'Maximum number of users allowed',
                      },
                    },
                    additionalProperties: false,
                  },
                  settings: {
                    type: 'object',
                    description: 'Domain configuration settings',
                    properties: {
                      maintenanceMode: {
                        type: 'boolean',
                        description: 'Whether the domain is in maintenance mode',
                        default: false,
                      },
                    },
                    additionalProperties: false,
                  },
                  takaroConfig: {
                    type: 'object',
                    description: 'Takaro-specific configuration',
                    properties: {
                      apiUrl: {
                        type: 'string',
                        format: 'uri',
                        description: 'Override for Takaro API URL',
                      },
                      features: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                        description: 'List of enabled features for this domain',
                      },
                    },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
              status: {
                type: 'object',
                properties: {
                  phase: {
                    type: 'string',
                    enum: ['Pending', 'Creating', 'Ready', 'Error', 'Deleting'],
                    description: 'Current phase of the domain lifecycle',
                  },
                  externalReferenceId: {
                    type: 'string',
                    description: 'The ID of the domain in Takaro',
                  },
                  registrationToken: {
                    type: 'string',
                    description: 'Domain registration token for game server connections',
                  },
                  rootUserCredentials: {
                    type: 'object',
                    properties: {
                      username: {
                        type: 'string',
                        description: 'Username of the root user',
                      },
                      secretName: {
                        type: 'string',
                        description: 'Name of the secret containing root user credentials',
                      },
                    },
                    required: ['username', 'secretName'],
                    additionalProperties: false,
                  },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['type', 'status', 'lastTransitionTime', 'reason', 'message'],
                      properties: {
                        type: {
                          type: 'string',
                          enum: ['Ready', 'Synced', 'Error'],
                          description: 'Type of condition',
                        },
                        status: {
                          type: 'string',
                          enum: ['True', 'False', 'Unknown'],
                          description: 'Status of the condition',
                        },
                        lastTransitionTime: {
                          type: 'string',
                          format: 'date-time',
                          description: 'Last time the condition transitioned from one status to another',
                        },
                        reason: {
                          type: 'string',
                          maxLength: 128,
                          description: "Unique, one-word, CamelCase reason for the condition's last transition",
                        },
                        message: {
                          type: 'string',
                          maxLength: 512,
                          description: 'Human-readable message indicating details about last transition',
                        },
                      },
                      additionalProperties: false,
                    },
                    description: 'List of status conditions',
                  },
                  lastReconcileTime: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Last time the domain was reconciled',
                  },
                  observedGeneration: {
                    type: 'integer',
                    description: 'The generation of the spec that was last processed',
                  },
                },
                additionalProperties: false,
              },
            },
            required: ['apiVersion', 'kind', 'metadata', 'spec'],
            additionalProperties: false,
          },
        },
        subresources: {
          status: {},
        },
        additionalPrinterColumns: [
          {
            name: 'Domain Name',
            type: 'string',
            jsonPath: '.spec.name',
            description: 'The name of the domain in Takaro',
          },
          {
            name: 'Phase',
            type: 'string',
            jsonPath: '.status.phase',
            description: 'Current phase of the domain',
          },
          {
            name: 'External ID',
            type: 'string',
            jsonPath: '.status.externalReferenceId',
            description: 'External reference ID in Takaro',
          },
          {
            name: 'Age',
            type: 'date',
            jsonPath: '.metadata.creationTimestamp',
            description: 'Age of the resource',
          },
        ],
      },
    ],
    scope: 'Namespaced',
    names: {
      plural: 'domains',
      singular: 'domain',
      kind: 'Domain',
      shortNames: ['dom'],
    },
  },
};

export const DOMAIN_GROUP = 'takaro.io';
export const DOMAIN_VERSION = 'v1';
export const DOMAIN_PLURAL = 'domains';
