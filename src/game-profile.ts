/**
 * PC-98 GAME PROFILE SYSTEM
 * Defines textbox constraints, encoding, and metadata for different games
 * Allows the translation system to adapt to any PC-98 game
 */

export interface TextboxConstraint {
  widthChars: number;
  heightLines: number;
  encoding?: 'shift-jis' | 'euc-jp' | 'ascii';
  maxBytes?: number;
}

export interface GameProfile {
  id: string;
  name: string;
  developer?: string;
  year?: number;
  encoding: 'shift-jis' | 'euc-jp' | 'ascii';
  languages: {
    original: string;
    target: string;
  };
  textboxConstraints: Record<string, TextboxConstraint>;
  pointerSize?: number; // 0x2 = 16-bit, 0x4 = 32-bit
  endianness?: 'big-endian' | 'little-endian';
  notes?: string;
  website?: string;
  sourceType: 'disk-image' | 'rom' | 'archive';
}

/**
 * Built-in game profiles
 */
export const BUILTIN_PROFILES: Record<string, GameProfile> = {
  'alshark-pc98': {
    id: 'alshark-pc98',
    name: 'Alshark',
    developer: 'Alice Soft',
    year: 1988,
    encoding: 'shift-jis',
    languages: { original: 'ja', target: 'en' },
    textboxConstraints: {
      dialog: { widthChars: 16, heightLines: 3, maxBytes: 48 },
      ui_menu: { widthChars: 12, heightLines: 1, maxBytes: 12 },
      combat: { widthChars: 8, heightLines: 4, maxBytes: 32 },
      combat_status: { widthChars: 8, heightLines: 4, maxBytes: 32 },
      item_name: { widthChars: 10, heightLines: 1, maxBytes: 10 },
      status_label: { widthChars: 6, heightLines: 1, maxBytes: 6 },
      combat_menu: { widthChars: 6, heightLines: 1, maxBytes: 6 },
      default: { widthChars: 16, heightLines: 1, maxBytes: 16 }
    },
    pointerSize: 0x2,
    endianness: 'little-endian',
    notes: 'Early AI Soft adventure game. Fixed-width font, CJK support.',
    website: 'https://alicesoft.com',
    sourceType: 'disk-image'
  },

  'fantasy-ogre-pc98': {
    id: 'fantasy-ogre-pc98',
    name: 'Fantasy Ogre',
    developer: 'Alice Soft',
    year: 1989,
    encoding: 'shift-jis',
    languages: { original: 'ja', target: 'en' },
    textboxConstraints: {
      dialog: { widthChars: 16, heightLines: 4, maxBytes: 64 },
      menu: { widthChars: 14, heightLines: 1, maxBytes: 14 },
      battle: { widthChars: 12, heightLines: 2, maxBytes: 24 },
      status: { widthChars: 8, heightLines: 5, maxBytes: 40 },
      default: { widthChars: 16, heightLines: 2, maxBytes: 32 }
    },
    pointerSize: 0x2,
    endianness: 'little-endian',
    notes: 'Fantasy RPG with larger dialogue boxes.',
    sourceType: 'disk-image'
  },

  'rance-pc98': {
    id: 'rance-pc98',
    name: 'Rance',
    developer: 'Alice Soft',
    year: 1989,
    encoding: 'shift-jis',
    languages: { original: 'ja', target: 'en' },
    textboxConstraints: {
      dialog: { widthChars: 20, heightLines: 3, maxBytes: 60 },
      menu: { widthChars: 16, heightLines: 1, maxBytes: 16 },
      battle: { widthChars: 10, heightLines: 3, maxBytes: 30 },
      skill: { widthChars: 12, heightLines: 1, maxBytes: 12 },
      inventory: { widthChars: 14, heightLines: 1, maxBytes: 14 },
      default: { widthChars: 20, heightLines: 2, maxBytes: 40 }
    },
    pointerSize: 0x2,
    endianness: 'little-endian',
    notes: 'Popular AI Soft RPG. Wider text boxes than earlier titles.',
    sourceType: 'disk-image'
  },

  'generic-pc98': {
    id: 'generic-pc98',
    name: 'Generic PC-98 Game',
    encoding: 'shift-jis',
    languages: { original: 'ja', target: 'en' },
    textboxConstraints: {
      dialog: { widthChars: 16, heightLines: 3, maxBytes: 48 },
      menu: { widthChars: 12, heightLines: 1, maxBytes: 12 },
      status: { widthChars: 8, heightLines: 3, maxBytes: 24 },
      default: { widthChars: 16, heightLines: 2, maxBytes: 32 }
    },
    pointerSize: 0x2,
    endianness: 'little-endian',
    notes: 'Generic template for PC-98 games.',
    sourceType: 'disk-image'
  }
};

/**
 * Game profile manager
 */
export class GameProfileManager {
  private profiles: Map<string, GameProfile> = new Map();
  private currentProfile: GameProfile | null = null;

  constructor() {
    // Load built-in profiles
    for (const [id, profile] of Object.entries(BUILTIN_PROFILES)) {
      this.profiles.set(id, profile);
    }
  }

  /**
   * Get all available profiles
   */
  getProfiles(): GameProfile[] {
    return Array.from(this.profiles.values()).sort((a, b) =>
      (a.developer || '').localeCompare(b.developer || '')
    );
  }

  /**
   * Get profile by ID
   */
  getProfile(id: string): GameProfile | undefined {
    return this.profiles.get(id);
  }

  /**
   * Set current profile
   */
  setProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) {
      return false;
    }
    this.currentProfile = profile;
    return true;
  }

  /**
   * Get current profile
   */
  getCurrentProfile(): GameProfile {
    if (!this.currentProfile) {
      // Default to Alshark
      this.currentProfile = BUILTIN_PROFILES['alshark-pc98'];
    }
    return this.currentProfile;
  }

  /**
   * Get textbox constraint for category
   */
  getConstraint(category: string): TextboxConstraint {
    const profile = this.getCurrentProfile();
    return (
      profile.textboxConstraints[category] ||
      profile.textboxConstraints['default'] || {
        widthChars: 16,
        heightLines: 3,
        encoding: 'shift-jis'
      }
    );
  }

  /**
   * Register custom profile
   */
  registerProfile(profile: GameProfile): void {
    this.profiles.set(profile.id, profile);
  }

  /**
   * Add new profile from JSON
   */
  addProfileFromJson(jsonStr: string): GameProfile {
    const profile = JSON.parse(jsonStr) as GameProfile;
    if (!profile.id || !profile.name) {
      throw new Error('Profile must have id and name');
    }
    this.registerProfile(profile);
    return profile;
  }

  /**
   * Export current profile as JSON
   */
  exportCurrentProfileJson(): string {
    const profile = this.getCurrentProfile();
    return JSON.stringify(profile, null, 2);
  }

  /**
   * Get profiles by developer
   */
  getProfilesByDeveloper(developer: string): GameProfile[] {
    return Array.from(this.profiles.values()).filter(
      (p) => p.developer === developer
    );
  }

  /**
   * Get profiles by year
   */
  getProfilesByYear(year: number): GameProfile[] {
    return Array.from(this.profiles.values()).filter((p) => p.year === year);
  }

  /**
   * Create a custom profile template
   */
  createCustomProfile(template: {
    id: string;
    name: string;
    developer?: string;
  }): GameProfile {
    return {
      id: template.id,
      name: template.name,
      developer: template.developer,
      encoding: 'shift-jis',
      languages: { original: 'ja', target: 'en' },
      textboxConstraints: {
        dialog: { widthChars: 16, heightLines: 3, maxBytes: 48 },
        default: { widthChars: 16, heightLines: 1, maxBytes: 16 }
      },
      pointerSize: 0x2,
      endianness: 'little-endian',
      sourceType: 'disk-image'
    };
  }
}

/**
 * Example of how to use custom profiles
 */
export function exampleCustomProfile(): GameProfile {
  return {
    id: 'my-custom-game',
    name: 'My Custom PC-98 Game',
    developer: 'My Company',
    year: 1990,
    encoding: 'shift-jis',
    languages: { original: 'ja', target: 'en' },
    textboxConstraints: {
      dialog: { widthChars: 18, heightLines: 3, maxBytes: 54 },
      menu: { widthChars: 14, heightLines: 1, maxBytes: 14 },
      status: { widthChars: 10, heightLines: 2, maxBytes: 20 },
      default: { widthChars: 16, heightLines: 2, maxBytes: 32 }
    },
    pointerSize: 0x4,
    endianness: 'little-endian',
    notes: 'Custom game profile example',
    sourceType: 'disk-image'
  };
}
