# DiskScribe2026 JSON Schemas

These schemas define the structure of profiles, projects, and data artifacts used throughout the pipeline.

---

## 1. GameProfile Schema

Profiles describe how to extract text from a specific game/system.

**File:** `schemas/profile.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "GameProfile",
  "description": "Describes text extraction, encoding, and patching rules for a specific game or system family.",
  
  "type": "object",
  "required": ["profile_id", "name", "system_family", "container_types"],
  
  "properties": {
    "version": {
      "type": "string",
      "const": "1.0"
    },
    
    "profile_id": {
      "type": "string",
      "pattern": "^[a-z0-9_-]{3,50}$",
      "description": "Unique identifier, e.g. 'alshark_pc98', 'rance_series', 'generic_pc88'"
    },
    
    "name": {
      "type": "string",
      "description": "Human-readable name, e.g. 'Alshark (PC-98, 1989)'"
    },
    
    "system_family": {
      "type": "string",
      "enum": ["pc98", "pc88", "pcfx", "fm7", "x68k", "msx", "generic"],
      "description": "Target system or family"
    },
    
    "container_types": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Container formats this profile applies to, e.g. ['pc98_fdi', 'folder', 'zip']"
    },
    
    "metadata": {
      "type": "object",
      "properties": {
        "developer": {"type": "string"},
        "year": {"type": "integer", "minimum": 1980, "maximum": 2100},
        "supported_languages": {"type": "array", "items": {"type": "string"}},
        "confidence_weight": {"type": "number", "minimum": 0, "maximum": 1}
      }
    },
    
    "detection": {
      "type": "object",
      "description": "Rules to auto-detect this profile from manifest",
      "properties": {
        "file_patterns": {
          "type": "array",
          "items": {"type": "string"},
          "description": "Regex patterns for key files, e.g. ['^ALSHARK\\\\.EXE$', '\\\\.GRP$']"
        },
        "byte_signatures": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "offset": {"type": "integer"},
              "hex": {"type": "string"},
              "description": {"type": "string"}
            }
          }
        },
        "confidence_boost": {
          "type": "number",
          "description": "Add this to base confidence if signatures match"
        }
      }
    },
    
    "encoding": {
      "type": "object",
      "description": "Text encoding rules",
      "properties": {
        "default": {
          "type": "string",
          "enum": ["shift_jis", "euc_jp", "utf8", "ascii", "custom"],
          "description": "Primary encoding"
        },
        "overrides": {
          "type": "object",
          "description": "Per-file encoding overrides, e.g. {'SCRIPT.EXE': 'euc_jp'}"
        }
      }
    },
    
    "text_extraction": {
      "type": "object",
      "description": "Rules for finding and extracting text",
      "properties": {
        "strategy": {
          "type": "string",
          "enum": ["pointer_table", "marker_scan", "string_scan", "custom"],
          "description": "Extraction method"
        },
        "files": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "path_pattern": {"type": "string"},
              "strategy": {"type": "string"},
              "pointer_table_offset": {"type": "integer"},
              "pointer_format": {
                "type": "string",
                "enum": ["le16", "be16", "le32", "be32", "segment:offset", "custom"]
              },
              "string_terminator": {"type": "string", "default": "0x00"},
              "control_codes": {
                "type": "object",
                "description": "Mapping of byte values to control code types"
              }
            }
          }
        }
      }
    },
    
    "textbox_constraints": {
      "type": "object",
      "description": "Fixed textbox dimensions",
      "properties": {
        "default": {
          "$ref": "#/definitions/BoxSpec"
        },
        "by_scene": {
          "type": "object",
          "description": "Scene-specific overrides, e.g. {'battle_001': {...}}",
          "additionalProperties": {"$ref": "#/definitions/BoxSpec"}
        },
        "by_file": {
          "type": "object",
          "additionalProperties": {"$ref": "#/definitions/BoxSpec"}
        }
      }
    },
    
    "patching": {
      "type": "object",
      "description": "Patching strategy",
      "properties": {
        "default_strategy": {
          "type": "string",
          "enum": ["in_place", "repoint", "string_bank", "custom"],
          "default": "in_place"
        },
        "pointer_formats": {
          "type": "object",
          "description": "Describe pointer formats per file/region",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "format": {"type": "string"},
              "offset": {"type": "integer"},
              "size": {"type": "integer"}
            }
          }
        },
        "free_space_regions": {
          "type": "array",
          "description": "Regions safe for string bank relocation",
          "items": {
            "type": "object",
            "properties": {
              "file_path": {"type": "string"},
              "offset": {"type": "integer"},
              "size": {"type": "integer"}
            }
          }
        }
      }
    },
    
    "custom_rules": {
      "type": "object",
      "description": "Plugin-specific custom rules (if needed)",
      "additionalProperties": true
    }
  },
  
  "definitions": {
    "BoxSpec": {
      "type": "object",
      "properties": {
        "width_chars": {"type": "integer", "minimum": 1, "maximum": 256},
        "height_lines": {"type": "integer", "minimum": 1, "maximum": 256},
        "font_type": {
          "type": "string",
          "enum": ["monospace", "proportional"]
        },
        "language": {
          "type": "string",
          "enum": ["ja", "jp", "en", "mixed"]
        },
        "max_bytes": {"type": "integer", "minimum": 1},
        "wrapped_line_height": {"type": "number"}
      },
      "required": ["width_chars", "height_lines"]
    }
  }
}
```

---

**Example: Alshark Profile**

```json
{
  "version": "1.0",
  "profile_id": "alshark_pc98",
  "name": "Alshark (Alice Soft, PC-98, 1989)",
  "system_family": "pc98",
  "container_types": ["pc98_fdi", "folder"],
  
  "metadata": {
    "developer": "Alice Soft",
    "year": 1989,
    "supported_languages": ["ja"],
    "confidence_weight": 0.95
  },
  
  "detection": {
    "file_patterns": ["^ALSHARK\\.EXE$", "\\.GRP$"],
    "byte_signatures": [
      {
        "offset": 0,
        "hex": "4d5a",
        "description": "MZ header (DOS/PC-98 executable)"
      }
    ],
    "confidence_boost": 0.2
  },
  
  "encoding": {
    "default": "shift_jis",
    "overrides": {}
  },
  
  "text_extraction": {
    "strategy": "pointer_table",
    "files": [
      {
        "path_pattern": "^ALSHARK\\.EXE$",
        "strategy": "pointer_table",
        "pointer_table_offset": 0x2000,
        "pointer_format": "le16",
        "string_terminator": "0x00",
        "control_codes": {
          "0x01": "color_change",
          "0x02": "wait_for_input",
          "0x03": "speaker_name",
          "0x0a": "newline"
        }
      }
    ]
  },
  
  "textbox_constraints": {
    "default": {
      "width_chars": 16,
      "height_lines": 3,
      "font_type": "monospace",
      "language": "ja"
    },
    "by_file": {
      "BATTLE.EXE": {
        "width_chars": 8,
        "height_lines": 4,
        "font_type": "monospace",
        "language": "ja"
      },
      "MENU.EXE": {
        "width_chars": 12,
        "height_lines": 1,
        "font_type": "monospace",
        "language": "ja"
      }
    }
  },
  
  "patching": {
    "default_strategy": "in_place",
    "pointer_formats": {
      "ALSHARK.EXE": {
        "format": "le16",
        "offset": 0x2000,
        "size": 2
      }
    },
    "free_space_regions": [
      {
        "file_path": "ALSHARK.EXE",
        "offset": 0x50000,
        "size": 0x10000
      }
    ]
  }
}
```

---

## 2. ProjectIndex Schema

Describes the state of a localization project.

**File:** `schemas/project.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProjectIndex",
  "description": "Top-level metadata for a DiskScribe localization project",
  
  "type": "object",
  "required": ["version", "project_id", "input", "created_at"],
  
  "properties": {
    "version": {
      "type": "string",
      "const": "1.0"
    },
    
    "project_id": {
      "type": "string",
      "pattern": "^[a-f0-9-]{36}$",
      "description": "UUID v4"
    },
    
    "name": {
      "type": "string",
      "description": "Human-readable project name"
    },
    
    "created_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp"
    },
    
    "modified_at": {
      "type": "string",
      "format": "date-time"
    },
    
    "input": {
      "type": "object",
      "required": ["source_path", "source_hash", "container_type"],
      "properties": {
        "source_path": {
          "type": "string",
          "description": "Absolute or relative path to input media"
        },
        "source_hash": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$",
          "description": "SHA256 of entire input file/folder"
        },
        "container_type": {
          "type": "string",
          "enum": ["pc98_fdi", "pc88_d88", "iso9660", "zip", "folder", "raw_bin"]
        },
        "detected_profile": {
          "type": "string",
          "description": "Auto-detected game profile ID"
        },
        "detected_confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        }
      }
    },
    
    "stages": {
      "type": "object",
      "description": "Completion status of each pipeline stage",
      "properties": {
        "extraction": {
          "$ref": "#/definitions/StageStatus"
        },
        "translation": {
          "$ref": "#/definitions/StageStatus"
        },
        "layout": {
          "$ref": "#/definitions/StageStatus"
        },
        "patching": {
          "$ref": "#/definitions/StageStatus"
        }
      }
    },
    
    "config": {
      "type": "object",
      "description": "Project-specific configuration",
      "properties": {
        "profile_id": {
          "type": "string",
          "description": "Explicitly selected profile"
        },
        "translation_provider": {
          "type": "string",
          "enum": ["mock", "claude", "openai", "local"]
        },
        "target_language": {
          "type": "string",
          "default": "en"
        },
        "wrap_ruleset": {
          "type": "string",
          "enum": ["english", "japanese", "mixed"],
          "default": "english"
        }
      }
    },
    
    "stats": {
      "type": "object",
      "description": "Running aggregate statistics",
      "properties": {
        "total_strings_extracted": {"type": "integer"},
        "total_strings_translated": {"type": "integer"},
        "total_characters_original": {"type": "integer"},
        "total_characters_translated": {"type": "integer"},
        "quality_flags": {
          "type": "object",
          "additionalProperties": {"type": "integer"}
        }
      }
    },
    
    "paths": {
      "type": "object",
      "description": "Standard paths within project folder",
      "properties": {
        "input": {"type": "string", "default": "input/"},
        "extracted": {"type": "string", "default": "extracted/"},
        "translated": {"type": "string", "default": "translated/"},
        "layout": {"type": "string", "default": "layout/"},
        "patch": {"type": "string", "default": "patch/"},
        "output": {"type": "string", "default": "output/"}
      }
    }
  },
  
  "definitions": {
    "StageStatus": {
      "type": "object",
      "properties": {
        "completed": {"type": "boolean"},
        "completed_at": {"type": "string", "format": "date-time"},
        "duration_seconds": {"type": "number"},
        "error": {"type": "string"}
      }
    }
  }
}
```

---

**Example: Alshark Project**

```json
{
  "version": "1.0",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Alshark Translation Project",
  "created_at": "2026-02-26T10:30:00Z",
  "modified_at": "2026-02-26T15:45:00Z",
  
  "input": {
    "source_path": "/mnt/games/alshark.fdi",
    "source_hash": "abc123def456...",
    "container_type": "pc98_fdi",
    "detected_profile": "alshark_pc98",
    "detected_confidence": 0.94
  },
  
  "stages": {
    "extraction": {
      "completed": true,
      "completed_at": "2026-02-26T10:35:00Z",
      "duration_seconds": 5
    },
    "translation": {
      "completed": true,
      "completed_at": "2026-02-26T11:45:00Z",
      "duration_seconds": 70
    },
    "layout": {
      "completed": true,
      "completed_at": "2026-02-26T11:50:00Z",
      "duration_seconds": 10
    },
    "patching": {
      "completed": true,
      "completed_at": "2026-02-26T11:52:00Z",
      "duration_seconds": 3
    }
  },
  
  "config": {
    "profile_id": "alshark_pc98",
    "translation_provider": "mock",
    "target_language": "en",
    "wrap_ruleset": "english"
  },
  
  "stats": {
    "total_strings_extracted": 2547,
    "total_strings_translated": 2547,
    "total_characters_original": 45230,
    "total_characters_translated": 52100,
    "quality_flags": {
      "overflow_risk": 12,
      "needs_manual_review": 5
    }
  },
  
  "paths": {
    "input": "input/",
    "extracted": "extracted/",
    "translated": "translated/",
    "layout": "layout/",
    "patch": "patch/",
    "output": "output/"
  }
}
```

---

## 3. StringTable Schema

Complete extracted and translated strings.

**File:** `schemas/strings.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "StringTable",
  "description": "All extracted and translated strings for a project",
  
  "type": "object",
  "required": ["version", "total_count", "strings"],
  
  "properties": {
    "version": {"type": "string", "const": "1.0"},
    "total_count": {"type": "integer"},
    "by_encoding": {"type": "object", "additionalProperties": {"type": "integer"}},
    "by_file": {"type": "object", "additionalProperties": {"type": "integer"}},
    
    "strings": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/StringUnit"
      }
    }
  },
  
  "definitions": {
    "StringUnit": {
      "type": "object",
      "required": ["id", "source", "original_text"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9_-]{3,50}$"
        },
        "source": {
          "type": "object",
          "required": ["volume", "file_path", "byte_offset"],
          "properties": {
            "volume": {"type": "integer", "minimum": 0},
            "file_path": {"type": "string"},
            "byte_offset": {"type": "integer", "minimum": 0},
            "byte_length": {"type": "integer", "minimum": 0},
            "pointer_offset": {"type": "integer"},
            "pointer_format": {
              "type": "string",
              "enum": ["le16", "be16", "le32", "be32", "segment:offset", "custom"]
            }
          }
        },
        "encoding": {
          "type": "string",
          "enum": ["shift_jis", "euc_jp", "utf8", "ascii", "custom"]
        },
        "original_bytes": {
          "type": "string",
          "description": "Hex-encoded original bytes"
        },
        "original_text": {"type": "string"},
        "control_codes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {"type": "string"},
              "position": {"type": "integer"},
              "value": true,
              "preserved": {"type": "boolean"}
            }
          }
        },
        "context": {"type": "string"},
        "box_constraint": {
          "type": "object",
          "properties": {
            "width_chars": {"type": "integer"},
            "height_lines": {"type": "integer"},
            "font_type": {"type": "string"},
            "language": {"type": "string"}
          }
        },
        "max_bytes": {"type": "integer"}
      }
    }
  }
}
```

---

## 4. LayoutResult Schema

Text wrapping and layout results.

**File:** `schemas/layout.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LayoutResult",
  "description": "Layout and wrapping results for translated strings",
  
  "type": "object",
  "required": ["version", "results"],
  
  "properties": {
    "version": {"type": "string", "const": "1.0"},
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["string_id", "original", "translated", "status"],
        "properties": {
          "string_id": {"type": "string"},
          "original": {"type": "string"},
          "translated": {"type": "string"},
          "wrapped_lines": {
            "type": "array",
            "items": {"type": "string"}
          },
          "final_render": {"type": "string"},
          "status": {
            "type": "string",
            "enum": ["ok", "wrapped", "truncated", "overflow"]
          },
          "issue": {"type": "string"},
          "metrics": {
            "type": "object",
            "properties": {
              "original_bytes": {"type": "integer"},
              "final_bytes": {"type": "integer"},
              "lines_needed": {"type": "integer"},
              "max_width_used": {"type": "integer"}
            }
          }
        }
      }
    },
    "summary": {
      "type": "object",
      "properties": {
        "ok": {"type": "integer"},
        "wrapped": {"type": "integer"},
        "truncated": {"type": "integer"},
        "overflow": {"type": "integer"}
      }
    }
  }
}
```

---

## 5. PatchReport Schema

Details of all patch operations.

**File:** `schemas/patch_report.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PatchReport",
  
  "type": "object",
  "required": ["version", "timestamp", "success_count", "failure_count"],
  
  "properties": {
    "version": {"type": "string", "const": "1.0"},
    "timestamp": {"type": "string", "format": "date-time"},
    
    "success_count": {"type": "integer"},
    "failure_count": {"type": "integer"},
    "skipped_count": {"type": "integer"},
    
    "strategy_used": {
      "type": "string",
      "enum": ["in_place", "repoint", "string_bank", "hybrid"]
    },
    
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "string_id": {"type": "string"},
          "status": {"type": "string", "enum": ["success", "overflow", "error", "skipped"]},
          "reason": {"type": "string"},
          "file_affected": {"type": "string"},
          "bytes_changed": {"type": "integer"},
          "pointers_rewritten": {"type": "integer"}
        }
      }
    },
    
    "file_hashes": {
      "type": "object",
      "description": "SHA256 of output files",
      "additionalProperties": {"type": "string"}
    },
    
    "warnings": {
      "type": "array",
      "items": {"type": "string"}
    }
  }
}
```

---

## Validation & Usage

All schemas are JSON Schema Draft 7 compatible. To validate:

```bash
npm install ajv                          # JSON schema validator

# Command-line validation
ajv validate -s schemas/profile.schema.json -d profiles/alshark_pc98.json

# In code
const Ajv = require('ajv');
const ajv = new Ajv();
const validate = ajv.compile(profileSchema);
const valid = validate(profileData);
```

