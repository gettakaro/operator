import * as k8s from '@kubernetes/client-node';
import { BaseController } from './base-controller.js';

export class ControllerRegistry {
  private controllers: Map<string, BaseController> = new Map();

  register(name: string, controller: BaseController): void {
    if (this.controllers.has(name)) {
      throw new Error(`Controller '${name}' is already registered`);
    }
    this.controllers.set(name, controller);
    console.log(`Registered controller: ${name}`);
  }

  unregister(name: string): void {
    if (this.controllers.delete(name)) {
      console.log(`Unregistered controller: ${name}`);
    }
  }

  get(name: string): BaseController | undefined {
    return this.controllers.get(name);
  }

  getAll(): BaseController[] {
    return Array.from(this.controllers.values());
  }

  async startAll(): Promise<void> {
    console.log('Starting all controllers...');
    const controllers = this.getAll();

    try {
      await Promise.all(controllers.map((controller) => controller.start()));
      console.log('All controllers started successfully');
    } catch (error) {
      console.error('Failed to start controllers:', error);
      await this.stopAll();
      throw error;
    }
  }

  async stopAll(): Promise<void> {
    console.log('Stopping all controllers...');
    const controllers = this.getAll();

    await Promise.all(controllers.map((controller) => controller.stop()));
    console.log('All controllers stopped');
  }

  async restart(name: string): Promise<void> {
    const controller = this.get(name);
    if (!controller) {
      throw new Error(`Controller '${name}' not found`);
    }

    await controller.stop();
    await controller.start();
    console.log(`Controller '${name}' restarted`);
  }

  async restartAll(): Promise<void> {
    await this.stopAll();
    await this.startAll();
  }

  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [name, controller] of this.controllers) {
      status[name] = {
        name,
        running: controller.getIsRunning(),
        type: controller.constructor.name,
      };
    }

    return status;
  }

  list(): string[] {
    return Array.from(this.controllers.keys());
  }
}
