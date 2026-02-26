/**
 * Container Plugin System - Base Interface
 *
 * TICKET 1.2.1: Define IContainerPlugin interface + ContainerRegistry
 *
 * Purpose:
 * - Define contract for all container format plugins
 * - Enable pluggable architecture for different file formats
 * - Support auto-detection and registration
 *
 * Status: ✅ COMPLETE (200 LOC)
 */

import { ContainerManifest, IContainerManifest } from '../core';

/**
 * Interface all container plugins must implement
 */
export interface IContainerPlugin {
  /** Unique identifier for this container type (e.g., "pc98_fdi") */
  container_type: string;

  /** Human-readable description */
  description: string;

  /** Plugin version */
  version: string;

  /**
   * Check if this plugin can handle the given input
   *
   * @param input File path (string) or buffer containing file data
   * @returns True if this plugin can process the input
   */
  can_handle(input: string | Buffer): Promise<boolean>;

  /**
   * Parse a container and return its manifest
   *
   * @param input_path Path to container file
   * @returns ContainerManifest describing all files in container
   * @throws Error if parsing fails
   */
  open(input_path: string): Promise<IContainerManifest>;

  /**
   * Extract a single file from container to disk
   *
   * @param manifest The manifest returned by open()
   * @param file_path Path of file to extract (must be in manifest)
   * @param output_path Where to write extracted file
   * @returns Buffer containing extracted file data
   * @throws Error if extraction fails
   */
  extract(
    manifest: IContainerManifest,
    file_path: string,
    output_path: string
  ): Promise<Buffer>;

  /**
   * List all files in container
   *
   * @param manifest The manifest
   * @returns Array of file paths
   */
  list_files(manifest: IContainerManifest): string[];
}

/**
 * Registry for container format plugins
 *
 * Usage:
 *   ContainerRegistry.register(new PC98FDIPlugin());
 *   const plugin = ContainerRegistry.get('pc98_fdi');
 *   const type = await ContainerRegistry.detect('game.fdi');
 */
export class ContainerRegistry {
  private static plugins = new Map<string, IContainerPlugin>();

  /**
   * Register a container plugin
   *
   * @param plugin Plugin instance
   * @throws Error if plugin_id already registered
   */
  static register(plugin: IContainerPlugin): void {
    if (this.plugins.has(plugin.container_type)) {
      throw new Error(`Container plugin "${plugin.container_type}" already registered`);
    }
    this.plugins.set(plugin.container_type, plugin);
  }

  /**
   * Get a registered plugin by type
   *
   * @param container_type Container type identifier
   * @returns Plugin or null if not found
   */
  static get(container_type: string): IContainerPlugin | null {
    return this.plugins.get(container_type) || null;
  }

  /**
   * Auto-detect which plugin can handle the input
   *
   * @param input_path File path to detect
   * @returns Container type string or null if no plugin found
   */
  static async detect(input_path: string): Promise<string | null> {
    const fs = await import('fs').then((m) => m.promises);

    // Try file extension first (fast path)
    const ext = input_path.split('.').pop()?.toLowerCase() || '';
    const by_ext = Array.from(this.plugins.values()).find(
      (p) => p.container_type.includes(ext)
    );
    if (by_ext && (await by_ext.can_handle(input_path))) {
      return by_ext.container_type;
    }

    // Fall back to magic byte detection (probe file)
    try {
      const buffer = await fs.readFile(input_path);
      for (const plugin of this.plugins.values()) {
        if (await plugin.can_handle(buffer)) {
          return plugin.container_type;
        }
      }
    } catch (e) {
      // File read failed
    }

    return null;
  }

  /**
   * Unregister a plugin
   *
   * @param container_type Type to unregister
   * @returns True if removed
   */
  static unregister(container_type: string): boolean {
    return this.plugins.delete(container_type);
  }

  /**
   * List all registered container types
   *
   * @returns Array of container type identifiers
   */
  static list_all(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get count of registered plugins
   *
   * @returns Number of plugins
   */
  static count(): number {
    return this.plugins.size;
  }

  /**
   * Get information on all registered plugins
   *
   * @returns Array of plugin info
   */
  static info(): Array<{
    container_type: string;
    description: string;
    version: string;
  }> {
    return Array.from(this.plugins.values()).map((p) => ({
      container_type: p.container_type,
      description: p.description,
      version: p.version
    }));
  }

  /**
   * Clear all plugins (useful for testing)
   */
  static clear(): void {
    this.plugins.clear();
  }
}
