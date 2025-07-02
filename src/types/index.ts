import { V1ObjectMeta } from '@kubernetes/client-node';

// Base types for Kubernetes resources
export interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: V1ObjectMeta;
}

// Condition types for status reporting
export interface Condition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  lastTransitionTime: string;
  reason?: string;
  message?: string;
}

// Common status structure for CRDs
export interface ResourceStatus {
  conditions?: Condition[];
  observedGeneration?: number;
  phase?: string;
}

// Controller result types
export interface ReconcileResult {
  requeue?: boolean;
  requeueAfter?: number; // milliseconds
}

// Error types
export class ReconcileError extends Error {
  constructor(
    message: string,
    public readonly temporary: boolean = true,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'ReconcileError';
  }
}

// Event phases for watches
export type WatchPhase = 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';

// Controller interface
export interface Controller {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// Metrics types
export interface OperatorMetrics {
  reconciliationsTotal: number;
  reconciliationErrorsTotal: number;
  reconciliationDuration: number[];
  activeResources: {
    domains: number;
    mockServers: number;
    users: number;
  };
}

// Utility type for deep partial
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};