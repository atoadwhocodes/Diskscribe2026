/**
 * Core Data Models - Phase 1.1
 *
 * Exports the foundational data structures for DiskScribe2026
 */

export {
  ContainerManifest,
  ContainerManifestFactory,
  type IContainerManifest,
  type IFileEntry
} from './container_manifest';

export {
  StringTable,
  type IStringUnit,
  type ControlCode
} from './string_table';

export {
  TranslationTable,
  type ITranslation
} from './translation_table';

export {
  Project,
  type IProject,
  type ProjectConfig,
  type StageStatus
} from './project';
