import * as k8s from '@kubernetes/client-node';
import { BaseController } from './base-controller.js';

export class ControllerRegistry {
  private controllers: Map<string, BaseController> = new Map();
  private isStarted = false;

  constructor(_kc: k8s.KubeConfig) {
    // KubeConfig passed for future use
  }

  register(name: string, controller: BaseController): void {
    if (this.isStarted) {
      throw new Error('Cannot register controllers after registry has started');
    }

    if (this.controllers.has(name)) {
      throw new Error(`Controller '${name}' is already registered`);
    }

    console.log(`Registering controller: ${name}`);
    this.controllers.set(name, controller);
  }

  async startAll(): Promise<void> {
    if (this.isStarted) {
      console.log('Controller registry is already started');
      return;
    }

    console.log(`Starting ${this.controllers.size} controllers...`);
    this.isStarted = true;

    const startPromises: Promise<void>[] = [];
    for (const [name, controller] of this.controllers) {
      console.log(`Starting controller: ${name}`);
      startPromises.push(
        controller.start().catch((error) => {
          console.error(`Failed to start controller '${name}':`, error);
          throw error;
        }),
      );
    }

    try {
      await Promise.all(startPromises);
      console.log('All controllers started successfully');
    } catch (error) {
      console.error('Failed to start all controllers, stopping...');
      await this.stopAll();
      throw error;
    }
  }

  async stopAll(): Promise<void> {
    if (!this.isStarted) {
      console.log('Controller registry is not started');
      return;
    }

    console.log(`Stopping ${this.controllers.size} controllers...`);
    this.isStarted = false;

    const stopPromises: Promise<void>[] = [];
    for (const [name, controller] of this.controllers) {
      console.log(`Stopping controller: ${name}`);
      stopPromises.push(
        controller.stop().catch((error) => {
          console.error(`Failed to stop controller '${name}':`, error);
        }),
      );
    }

    await Promise.all(stopPromises);
    console.log('All controllers stopped');
  }

  getController(name: string): BaseController | undefined {
    return this.controllers.get(name);
  }

  getControllerNames(): string[] {
    return Array.from(this.controllers.keys());
  }

  isRunning(): boolean {
    return this.isStarted;
  }

  getStatus(): { name: string; running: boolean }[] {
    const status: { name: string; running: boolean }[] = [];
    for (const [name, controller] of this.controllers) {
      status.push({
        name,
        running: (controller as any).isRunning || false,
      });
    }
    return status;
  }
}