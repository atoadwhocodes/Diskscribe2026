/**
 * Container Plugin System - Phase 1.2
 *
 * Exports container plugins and registry
 */

export { ContainerRegistry, type IContainerPlugin } from './base';
export { PC98FDIPlugin } from './pc98_fdi';

// Auto-register built-in plugins on import
import { ContainerRegistry } from './base';
import { PC98FDIPlugin } from './pc98_fdi';

// Register PC-98 FDI plugin
try {
  ContainerRegistry.register(new PC98FDIPlugin());
} catch (e) {
  // Plugin already registered or error
}
