import { AdminClient, Client, DomainCreateInputDTO, DomainUpdateInputDTO, UserCreateInputDTO } from '@takaro/apiclient';
import { loadConfig } from '../config/index.js';

export interface TakaroDomainLimits {
  maxPlayers?: number;
  maxGameServers?: number;
  maxUsers?: number;
}

export interface TakaroDomainSettings {
  maintenanceMode?: boolean;
  publiclyVisible?: boolean;
  allowRegistration?: boolean;
}

export interface TakaroDomain {
  id: string;
  name: string;
  limits?: TakaroDomainLimits;
  settings?: TakaroDomainSettings;
  registrationToken?: string;
}

export interface TakaroRootUser {
  username: string;
  password: string;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export class TakaroClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: any
  ) {
    super(message);
    this.name = 'TakaroClientError';
  }
}

export class TakaroClient {
  private readonly adminClient: AdminClient;
  private readonly userClient: Client;
  private readonly config = loadConfig();

  constructor(apiUrl?: string, apiToken?: string) {
    const baseUrl = apiUrl || this.config.takaroApiUrl;
    const token = apiToken || this.config.takaroApiToken;

    this.adminClient = new AdminClient({
      url: baseUrl,
      auth: {
        clientSecret: token,
      },
      log: false,
    });

    this.userClient = new Client({
      url: baseUrl,
      auth: {
        token,
      },
      log: false,
    });
  }

  async createDomain(
    name: string,
    externalReferenceId: string,
    limits?: TakaroDomainLimits,
    settings?: TakaroDomainSettings
  ): Promise<TakaroDomain> {
    console.log(`Creating domain: ${name} with external reference: ${externalReferenceId}`);

    const input: DomainCreateInputDTO = {
      name,
      externalReference: externalReferenceId,
      state: settings?.maintenanceMode ? 'MAINTENANCE' : 'ACTIVE',
    };

    // Add limits if provided
    if (limits?.maxGameServers) {
      input.maxGameservers = limits.maxGameServers;
    }
    if (limits?.maxUsers) {
      input.maxUsers = limits.maxUsers;
    }

    try {
      const response = await this.retryOperation(
        async () => await this.adminClient.domain.domainControllerCreate(input),
        { maxRetries: 3 }
      );

      const domain = response.data.data;
      return {
        id: domain.id,
        name: domain.name,
        limits: {
          maxPlayers: limits?.maxPlayers,
          maxGameServers: limits?.maxGameServers,
          maxUsers: limits?.maxUsers,
        },
        settings: {
          maintenanceMode: domain.state === 'MAINTENANCE',
        },
      };
    } catch (error: any) {
      console.error('Failed to create domain:', error);
      throw new TakaroClientError(
        `Failed to create domain ${name}`,
        error.response?.status,
        error
      );
    }
  }

  async updateDomain(
    domainId: string,
    limits?: TakaroDomainLimits,
    settings?: TakaroDomainSettings
  ): Promise<TakaroDomain> {
    console.log(`Updating domain: ${domainId}`);

    const input: DomainUpdateInputDTO = {};

    if (settings?.maintenanceMode !== undefined) {
      input.state = settings.maintenanceMode ? 'MAINTENANCE' : 'ACTIVE';
    }

    try {
      const response = await this.retryOperation(
        async () => await this.adminClient.domain.domainControllerUpdate(domainId, input),
        { maxRetries: 3 }
      );

      const domain = response.data.data;
      return {
        id: domain.id,
        name: domain.name,
        limits: {
          maxPlayers: limits?.maxPlayers,
          maxGameServers: limits?.maxGameServers,
          maxUsers: limits?.maxUsers,
        },
        settings: {
          maintenanceMode: domain.state === 'MAINTENANCE',
        },
      };
    } catch (error: any) {
      console.error('Failed to update domain:', error);
      throw new TakaroClientError(
        `Failed to update domain ${domainId}`,
        error.response?.status,
        error
      );
    }
  }

  async deleteDomain(domainId: string): Promise<void> {
    console.log(`Deleting domain: ${domainId}`);

    try {
      await this.retryOperation(
        async () => await this.adminClient.domain.domainControllerRemove(domainId),
        { maxRetries: 3 }
      );
    } catch (error: any) {
      console.error('Failed to delete domain:', error);
      if (error.response?.status === 404) {
        console.log('Domain already deleted, ignoring error');
        return;
      }
      throw new TakaroClientError(
        `Failed to delete domain ${domainId}`,
        error.response?.status,
        error
      );
    }
  }

  async getDomain(domainId: string): Promise<TakaroDomain | null> {
    console.log(`Getting domain: ${domainId}`);

    try {
      const response = await this.retryOperation(
        async () => await this.adminClient.domain.domainControllerGetOne(domainId),
        { maxRetries: 2 }
      );

      const domain = response.data.data;
      return {
        id: domain.id,
        name: domain.name,
        limits: {},
        settings: {
          maintenanceMode: domain.state === 'MAINTENANCE',
        },
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Failed to get domain:', error);
      throw new TakaroClientError(
        `Failed to get domain ${domainId}`,
        error.response?.status,
        error
      );
    }
  }

  async generateRegistrationToken(domainId: string): Promise<string> {
    console.log(`Generating registration token for domain: ${domainId}`);

    try {
      const response = await this.retryOperation(
        async () => await this.adminClient.domain.domainControllerGetToken(),
        { maxRetries: 3 }
      );

      return response.data.data.token;
    } catch (error: any) {
      console.error('Failed to generate registration token:', error);
      throw new TakaroClientError(
        `Failed to generate registration token for domain ${domainId}`,
        error.response?.status,
        error
      );
    }
  }

  async createRootUser(domainId: string): Promise<TakaroRootUser> {
    console.log(`Creating root user for domain: ${domainId}`);

    const username = `root-${domainId.substring(0, 8)}`;
    const password = this.generateSecurePassword();

    const input: UserCreateInputDTO = {
      name: username,
      email: `${username}@takaro-operator.local`,
      password,
    };

    try {
      this.userClient.token = this.config.takaroApiToken;
      
      await this.retryOperation(
        async () => await this.userClient.user.userControllerCreate(input),
        { maxRetries: 3 }
      );

      return { username, password };
    } catch (error: any) {
      console.error('Failed to create root user:', error);
      throw new TakaroClientError(
        `Failed to create root user for domain ${domainId}`,
        error.response?.status,
        error
      );
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        const statusCode = error.response?.status;

        if (isLastAttempt || (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, baseDelay, maxDelay, error);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await this.sleep(delay);
      }
    }

    throw new Error('Retry operation failed to return a value');
  }

  private calculateDelay(attempt: number, baseDelay: number, maxDelay: number, error: any): number {
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      const retryAfterMs = parseInt(retryAfter, 10) * 1000;
      return Math.min(retryAfterMs, maxDelay);
    }

    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}