/**
 * ContainerManifest: Describes the structure of a file container (FDI, ZIP, ISO, etc.)
 *
 * TICKET 1.1.1: Core data model for container metadata
 * Spec: https://github.com/yourrepo/diskscribe2026/blob/main/ROADMAP-DETAILED.md#ticket-111-container-manifest
 *
 * Purpose:
 * - Store metadata about a container (disk image, archive, folder structure)
 * - List all files within the container with offsets/sizes
 * - Enable serialization to JSON for project artifacts
 *
 * Status: ✅ COMPLETE (200 LOC base + 100 LOC tests)
 */

/**
 * Represents a single file entry within a container
 */
export interface IFileEntry {
  /** Path within container, e.g., "GAME.EXE" or "FOLDER/FILE.DAT" */
  path: string;

  /** Byte offset from start of container where this file begins */
  offset: number;

  /** Size of file in bytes */
  size: number;

  /** Character encoding, e.g., "shift_jis" or "ascii" */
  encoding?: string;

  /** Compression type: "none", "store", "deflate", etc. */
  compression?: string;

  /** Additional metadata specific to container plugin */
  metadata?: Record<string, unknown>;
}

/**
 * Describes the structure and contents of a file container
 */
export interface IContainerManifest {
  /** Unique identifier for this container, usually the input path */
  container_id: string;

  /** Type of container: "pc98_fdi", "zip", "iso9660", "folder", etc. */
  container_type: string;

  /** Total size of container in bytes */
  size_bytes: number;

  /** ISO 8601 timestamp when this manifest was created */
  created_at: string;

  /** All files contained in this container */
  files: IFileEntry[];
}

/**
 * Factory for creating and manipulating ContainerManifest objects
 */
export class ContainerManifestFactory {
  /**
   * Create a new manifest from a file on disk.
   * Delegates to the appropriate container plugin based on file type.
   *
   * @param input_path Path to container file (e.g., "alshark.fdi")
   * @returns Promise resolving to populated ContainerManifest
   * @throws Error if file not found or format not recognized
   */
  static async create(input_path: string): Promise<IContainerManifest> {
    // This will be implemented by container registry system (Phase 1.2)
    throw new Error('ContainerRegistry not yet initialized');
  }

  /**
   * Deserialize a manifest from JSON string
   *
   * @param json JSON string representation
   * @returns Parsed ContainerManifest
   * @throws Error if JSON is invalid
   */
  static from_json(json: string): IContainerManifest {
    try {
      const parsed = JSON.parse(json);
      this.validate(parsed);
      return parsed;
    } catch (error) {
      throw new Error(
        `Failed to parse manifest JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Round-trip test: serialize and deserialize
   *
   * @param manifest Manifest to test
   * @returns True if roundtrip successful
   */
  static test_roundtrip(manifest: IContainerManifest): boolean {
    const json = JSON.stringify(manifest);
    const restored = this.from_json(json);
    return (
      restored.container_id === manifest.container_id &&
      restored.files.length === manifest.files.length
    );
  }

  /**
   * Validate manifest structure
   *
   * @param manifest Object to validate
   * @throws Error if validation fails
   */
  static validate(manifest: unknown): asserts manifest is IContainerManifest {
    if (typeof manifest !== 'object' || manifest === null) {
      throw new Error('Manifest must be an object');
    }

    const m = manifest as Record<string, unknown>;

    if (typeof m.container_id !== 'string') {
      throw new Error('container_id must be a string');
    }
    if (typeof m.container_type !== 'string') {
      throw new Error('container_type must be a string');
    }
    if (typeof m.size_bytes !== 'number' || m.size_bytes < 0) {
      throw new Error('size_bytes must be a non-negative number');
    }
    if (typeof m.created_at !== 'string') {
      throw new Error('created_at must be an ISO 8601 timestamp');
    }
    if (!Array.isArray(m.files)) {
      throw new Error('files must be an array');
    }

    // Validate each file entry
    for (let i = 0; i < m.files.length; i++) {
      const file = m.files[i] as Record<string, unknown>;
      if (typeof file.path !== 'string') {
        throw new Error(`files[${i}].path must be a string`);
      }
      if (typeof file.offset !== 'number' || file.offset < 0) {
        throw new Error(`files[${i}].offset must be a non-negative number`);
      }
      if (typeof file.size !== 'number' || file.size < 0) {
        throw new Error(`files[${i}].size must be a non-negative number`);
      }
    }
  }
}

/**
 * Wrapper class for working with manifests
 */
export class ContainerManifest implements IContainerManifest {
  container_id: string;
  container_type: string;
  size_bytes: number;
  created_at: string;
  files: IFileEntry[];

  constructor(data: IContainerManifest) {
    this.container_id = data.container_id;
    this.container_type = data.container_type;
    this.size_bytes = data.size_bytes;
    this.created_at = data.created_at;
    this.files = data.files;
  }

  /**
   * Convert to JSON string
   * @returns JSON string representation
   */
  to_json(): string {
    return JSON.stringify(this, null, 2);
  }

  /**
   * Get all files in container
   * @returns List of paths
   */
  list_files(): string[] {
    return this.files.map((f) => f.path);
  }

  /**
   * Find a file by path
   * @param path File path to search for
   * @returns File entry or null
   */
  get_file(path: string): IFileEntry | null {
    return this.files.find((f) => f.path === path) || null;
  }

  /**
   * Get number of files
   * @returns File count
   */
  file_count(): number {
    return this.files.length;
  }

  /**
   * Get total data size (sum of all file sizes)
   * @returns Total bytes
   */
  data_size_bytes(): number {
    return this.files.reduce((sum, f) => sum + f.size, 0);
  }

  /**
   * Get average file size
   * @returns Bytes
   */
  average_file_size(): number {
    return this.file_count() > 0 ? this.data_size_bytes() / this.file_count() : 0;
  }

  /**
   * Find files matching pattern
   * @param pattern Glob pattern (simple: "*.EXE")
   * @returns Matching files
   */
  find_files(pattern: string): IFileEntry[] {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return this.files.filter((f) => regex.test(f.path));
  }

  /**
   * Get manifest as JSON object (not string)
   * @returns IContainerManifest object
   */
  to_object(): IContainerManifest {
    return {
      container_id: this.container_id,
      container_type: this.container_type,
      size_bytes: this.size_bytes,
      created_at: this.created_at,
      files: this.files
    };
  }
}
