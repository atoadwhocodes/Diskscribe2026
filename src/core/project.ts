/**
 * Project: Manages all artifacts and state for a translation project
 *
 * TICKET 1.1.4: Core data model for project lifecycle
 * Spec: https://github.com/yourrepo/diskscribe2026/blob/main/ROADMAP-DETAILED.md#ticket-114-project-structure
 *
 * Purpose:
 * - Track project configuration and state through all stages
 * - Store and manage artifacts (manifest, strings, translations, layout, patches)
 * - Enable reproducibility and resumable workflows
 * - Provide save/load functionality
 *
 * Status: ✅ COMPLETE (300 LOC base + 150 LOC operations)
 */

import {
  ContainerManifest,
  IContainerManifest
} from './container_manifest';
import { StringTable, IStringUnit } from './string_table';
import { TranslationTable, ITranslation } from './translation_table';

/**
 * Stage of project completion
 */
export interface StageStatus {
  status: 'pending' | 'in_progress' | 'done' | 'error';
  timestamp?: string;
  error?: string;
}

/**
 * Project configuration
 */
export interface ProjectConfig {
  /** Path to input file/folder (e.g., alshark.fdi) */
  input_path: string;

  /** Type of container ("pc98_fdi", "zip", etc.) */
  container_type: string;

  /** Game profile ID to use for extraction (e.g., "alshark_pc98") */
  profile_id: string;

  /** Source language (detected from profile) */
  source_lang: string;

  /** Target language for translation (e.g., "en") */
  target_lang: string;

  /** Translation provider ("mock", "claude", etc.) */
  provider: string;

  /** Provider-specific configuration */
  provider_config?: Record<string, unknown>;
}

/**
 * Project metadata and artifact tracking
 */
export interface IProject {
  /** Unique project ID (e.g., "alshark_en_v1") */
  project_id: string;

  /** Human-readable name */
  name: string;

  /** Optional description */
  description?: string;

  /** Project configuration */
  config: ProjectConfig;

  /** Stage completion status */
  stages: {
    extraction: StageStatus;
    translation: StageStatus;
    layout: StageStatus;
    patching: StageStatus;
  };

  /** Container manifest (after extraction) */
  manifest?: IContainerManifest;

  /** Extracted strings (after extraction stage) */
  strings?: IStringUnit[];

  /** Translations (after translation stage) */
  translations?: ITranslation[];

  /** Layout results (after layout stage) */
  layout_result?: Array<{
    id: string;
    wrapped_lines: string[];
  }>;

  /** Patch report (after patching stage) */
  patch_report?: {
    success: boolean;
    patched_file: string;
    total_patches: number;
    failed_patches: number;
  };

  /** Timestamp when project was created */
  created_at: string;

  /** Timestamp of last modification */
  updated_at: string;
}

/**
 * Main project class for managing translation localization workflow
 */
export class Project implements IProject {
  project_id: string;
  name: string;
  description?: string;
  config: ProjectConfig;
  stages: {
    extraction: StageStatus;
    translation: StageStatus;
    layout: StageStatus;
    patching: StageStatus;
  };
  manifest?: ContainerManifest;
  protected string_table?: StringTable;
  protected translation_table?: TranslationTable;
  layout_result?: Array<{ id: string; wrapped_lines: string[] }>;
  patch_report?: {
    success: boolean;
    patched_file: string;
    total_patches: number;
    failed_patches: number;
  };
  created_at: string;
  updated_at: string;

  /**
   * Create new project
   *
   * @param project_id Unique project identifier
   */
  constructor(project_id: string) {
    this.project_id = project_id;
    this.name = project_id;
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();

    // Initialize all stages to pending
    this.stages = {
      extraction: { status: 'pending' },
      translation: { status: 'pending' },
      layout: { status: 'pending' },
      patching: { status: 'pending' }
    };

    // Default config (will be overridden by init)
    this.config = {
      input_path: '',
      container_type: 'pc98_fdi',
      profile_id: 'generic_pc98',
      source_lang: 'ja',
      target_lang: 'en',
      provider: 'mock'
    };
  }

  /**
   * Initialize project with configuration
   *
   * @param config Partial config (will merge with defaults)
   */
  init(config: Partial<ProjectConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    // Validate required fields
    if (!this.config.input_path) {
      throw new Error('input_path is required');
    }
    if (!this.config.profile_id) {
      throw new Error('profile_id is required');
    }

    this.updated_at = new Date().toISOString();
  }

  /**
   * Mark a stage as complete
   *
   * @param stage Stage name
   */
  mark_stage_done(stage: 'extraction' | 'translation' | 'layout' | 'patching'): void {
    this.stages[stage] = {
      status: 'done',
      timestamp: new Date().toISOString()
    };
    this.updated_at = new Date().toISOString();
  }

  /**
   * Mark a stage as in progress
   *
   * @param stage Stage name
   */
  mark_stage_in_progress(stage: 'extraction' | 'translation' | 'layout' | 'patching'): void {
    this.stages[stage] = {
      status: 'in_progress',
      timestamp: new Date().toISOString()
    };
    this.updated_at = new Date().toISOString();
  }

  /**
   * Mark a stage as error
   *
   * @param stage Stage name
   * @param error Error message
   */
  mark_stage_error(
    stage: 'extraction' | 'translation' | 'layout' | 'patching',
    error: string
  ): void {
    this.stages[stage] = {
      status: 'error',
      error,
      timestamp: new Date().toISOString()
    };
    this.updated_at = new Date().toISOString();
  }

  /**
   * Get progress report
   *
   * @returns Summary of completed stages
   */
  stage_progress(): {
    done: string[];
    pending: string[];
    in_progress: string[];
    errors: string[];
  } {
    const done: string[] = [];
    const pending: string[] = [];
    const in_progress: string[] = [];
    const errors: string[] = [];

    for (const [stage, status] of Object.entries(this.stages)) {
      if (status.status === 'done') {
        done.push(stage);
      } else if (status.status === 'pending') {
        pending.push(stage);
      } else if (status.status === 'in_progress') {
        in_progress.push(stage);
      } else if (status.status === 'error') {
        errors.push(stage);
      }
    }

    return { done, pending, in_progress, errors };
  }

  /**
   * Check if project is complete
   *
   * @returns True if all stages done
   */
  is_complete(): boolean {
    return (
      this.stages.extraction.status === 'done' &&
      this.stages.translation.status === 'done' &&
      this.stages.layout.status === 'done' &&
      this.stages.patching.status === 'done'
    );
  }

  /**
   * Set the container manifest
   *
   * @param manifest Container manifest
   */
  set_manifest(manifest: ContainerManifest): void {
    this.manifest = manifest;
    this.updated_at = new Date().toISOString();
  }

  /**
   * Get the container manifest
   *
   * @returns Manifest or undefined
   */
  get_manifest(): ContainerManifest | undefined {
    return this.manifest;
  }

  /**
   * Set the string table
   *
   * @param table String table
   */
  set_strings(table: StringTable): void {
    this.string_table = table;
    this.updated_at = new Date().toISOString();
  }

  /**
   * Get the string table
   *
   * @returns String table or undefined
   */
  get_strings(): StringTable | undefined {
    return this.string_table;
  }

  /**
   * Set the translation table
   *
   * @param table Translation table
   */
  set_translations(table: TranslationTable): void {
    this.translation_table = table;
    this.updated_at = new Date().toISOString();
  }

  /**
   * Get the translation table
   *
   * @returns Translation table or undefined
   */
  get_translations(): TranslationTable | undefined {
    return this.translation_table;
  }

  /**
   * Save project to disk (export all artifacts)
   *
   * @param output_dir Directory to write project artifacts
   */
  async export_project(output_dir: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises);
    const path = await import('path');

    // Create directory structure
    await fs.mkdir(output_dir, { recursive: true });
    await fs.mkdir(path.join(output_dir, 'extracted'), { recursive: true });
    await fs.mkdir(path.join(output_dir, 'translated'), { recursive: true });
    await fs.mkdir(path.join(output_dir, 'layout'), { recursive: true });
    await fs.mkdir(path.join(output_dir, 'patched'), { recursive: true });

    // Save project metadata
    const project_data = {
      project_id: this.project_id,
      name: this.name,
      description: this.description,
      config: this.config,
      stages: this.stages,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
    await fs.writeFile(
      path.join(output_dir, 'project.json'),
      JSON.stringify(project_data, null, 2),
      'utf-8'
    );

    // Save manifest
    if (this.manifest) {
      await fs.writeFile(
        path.join(output_dir, 'manifest.json'),
        this.manifest.to_json(),
        'utf-8'
      );
    }

    // Save strings
    if (this.string_table) {
      await this.string_table.save_json(path.join(output_dir, 'extracted', 'strings.json'));
    }

    // Save translations
    if (this.translation_table) {
      await this.translation_table.save_json(
        path.join(output_dir, 'translated', 'translations.json')
      );
    }

    // Save layout
    if (this.layout_result) {
      await fs.writeFile(
        path.join(output_dir, 'layout', 'layout.json'),
        JSON.stringify(this.layout_result, null, 2),
        'utf-8'
      );
    }

    // Save patch report
    if (this.patch_report) {
      await fs.writeFile(
        path.join(output_dir, 'patched', 'patch.report'),
        JSON.stringify(this.patch_report, null, 2),
        'utf-8'
      );
    }
  }

  /**
   * Load project from disk
   *
   * @param project_json_path Path to project.json
   */
  async load_project(project_json_path: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises);
    const path = await import('path');

    const content = await fs.readFile(project_json_path, 'utf-8');
    const data = JSON.parse(content) as IProject;

    this.project_id = data.project_id;
    this.name = data.name;
    this.description = data.description;
    this.config = data.config;
    this.stages = data.stages;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;

    // Load artifacts
    const dir = path.dirname(project_json_path);

    // Load manifest
    const manifest_path = path.join(dir, 'manifest.json');
    try {
      const manifest_content = await fs.readFile(manifest_path, 'utf-8');
      const manifest_data = JSON.parse(manifest_content) as IContainerManifest;
      this.manifest = new ContainerManifest(manifest_data);
    } catch (e) {
      // Manifest optional
    }

    // Load strings
    const strings_path = path.join(dir, 'extracted', 'strings.json');
    try {
      const string_table = new StringTable();
      await string_table.load_json(strings_path);
      this.string_table = string_table;
    } catch (e) {
      // Strings optional
    }

    // Load translations
    const translations_path = path.join(dir, 'translated', 'translations.json');
    try {
      const translation_table = new TranslationTable();
      await translation_table.load_json(translations_path);
      this.translation_table = translation_table;
    } catch (e) {
      // Translations optional
    }
  }

  /**
   * Get project as plain object for API
   *
   * @returns Plain IProject object
   */
  to_object(): IProject {
    return {
      project_id: this.project_id,
      name: this.name,
      description: this.description,
      config: this.config,
      stages: this.stages,
      manifest: this.manifest?.to_object(),
      strings: this.string_table?.all(),
      translations: this.translation_table?.all(),
      layout_result: this.layout_result,
      patch_report: this.patch_report,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}
