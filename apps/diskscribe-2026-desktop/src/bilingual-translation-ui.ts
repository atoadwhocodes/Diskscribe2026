/**
 * BILINGUAL TRANSLATION UI CONTROLLER
 * Handles bilingual translation interface in the app
 * Integrates with text reflow engine for intelligent wrapping
 */

// Optional module types (graceful fallback if not available)
interface IErrorDialog {
  (options: { title: string; message: string; details?: string; type?: string }): void;
}

interface IToast {
  show(message: string, type: string, duration?: number): void;
}

interface IValidation {
  validateExtractionData(data: unknown): { valid: boolean; errors: string[] };
  validateProfile(profile: unknown): { valid: boolean; errors: string[] };
}

interface ITextReflowEngine {
  new (): unknown;
}

// Import error handling system (when available)
let errorDialog: IErrorDialog | null = null;
let Toast: IToast | null = null;
let Validation: IValidation | null = null;

if (typeof require !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const errorModule = require('../../../src/error-dialog.ts') as {
      showErrorDialog: IErrorDialog;
      Toast: IToast;
      Validation: IValidation;
    };
    errorDialog = errorModule.showErrorDialog;
    Toast = errorModule.Toast;
    Validation = errorModule.Validation;
  } catch (e) {
    console.log('Error dialog system not available');
  }
}

// Import text reflow engine if available (for Node.js testing)
let TextReflowEngine: ITextReflowEngine | null = null;
if (typeof require !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const reflow = require('../../../src/text-reflow.js') as {
      TextReflowEngine: ITextReflowEngine;
    };
    TextReflowEngine = reflow.TextReflowEngine;
  } catch (e) {
    console.log('Text reflow engine not available in this context');
  }
}

interface TextString {
  disk: string;
  offset: string;
  originalText: string;
  translation?: string;
  wrapped?: string;  // Reflowed text for display/patching
  wrappedLines?: string[];  // Individual lines
  reflowStatus?: 'ok' | 'wrapped' | 'truncated' | 'overflow' | 'needs_manual' | 'not_checked';
  category: string;
  isJapanese: boolean;
  verified?: boolean;
}

interface ExtractionData {
  totalStrings: number;
  disks: string[];
  strings: TextString[];
  byCategory: Record<string, TextString[]>;
}

class BilingualTranslationUI {
  private extraction: ExtractionData | null = null;
  private filtered: TextString[] = [];
  private currentFilter = 'all';
  private desktopBridge: { extractText?: Function; onTranslationProgress?: Function; getGameProfiles?: Function; autoTranslate?: Function; reflowText?: Function; saveProject?: Function; applyPatch?: Function; };
  private reflowEngine: unknown = null;
  private currentProfile = 'alshark-pc98';
  private gameProfiles: Array<{ id: string; name: string; [key: string]: unknown }> = [];

  constructor(desktopBridge: { extractText?: Function; onTranslationProgress?: Function; getGameProfiles?: Function; autoTranslate?: Function; reflowText?: Function; saveProject?: Function; applyPatch?: Function; }) {
    this.desktopBridge = desktopBridge;
    // Initialize reflow engine if available
    if (TextReflowEngine) {
      this.reflowEngine = new TextReflowEngine();
    }
    this.init();
  }

  private async init() {
    // Load game profiles
    try {
      if (this.desktopBridge?.getGameProfiles) {
        this.gameProfiles = await this.desktopBridge.getGameProfiles();
        this.renderGameProfileSelector();
      }
    } catch (error) {
      console.error('Failed to load game profiles:', error);
    }

    // Set up filter tabs
    const filterTabs = document.querySelectorAll('.filterTab') as NodeListOf<HTMLButtonElement>;
    filterTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => this.handleFilterChange(e));
    });

    // Set up main buttons
    const extractBtn = document.getElementById('translationExtractAllButton');
    if (extractBtn) {
      extractBtn.addEventListener('click', () => this.extractText());
    }

    const autoTranslateBtn = document.getElementById('translationAutoTranslateButton');
    if (autoTranslateBtn) {
      autoTranslateBtn.addEventListener('click', () => this.autoTranslate());
    }

    const saveBtn = document.getElementById('translationSaveJsonButton');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveTranslations());
    }

    const applyBtn = document.getElementById('translationReinsertButton');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applyTranslations());
    }

    // Set up progress listeners
    if (this.desktopBridge?.onTranslationProgress) {
      this.desktopBridge.onTranslationProgress((update: { message?: string; percentComplete?: number; type?: string }) => {
        this.handleProgressUpdate(update);
      });
    }
  }

  /**
   * Render  game profile selector dropdown
   */
  private renderGameProfileSelector() {
    const container = document.getElementById('gameProfileSelector') || this.createProfileSelector();
    const select = container.querySelector('select') as HTMLSelectElement;

    if (!select) return;

    // Clear existing options
    select.innerHTML = '';

    // Add profiles
    for (const profile of this.gameProfiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.name}${profile.developer ? ` (${profile.developer})` : ''}`;
      select.appendChild(option);
    }

    // Set current selection
    select.value = this.currentProfile;

    // Add change handler
    select.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      await this.selectGameProfile(target.value);
    });
  }

  /**
   * Create profile selector if it doesn't exist
   */
  private createProfileSelector(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'gameProfileSelector';
    container.style.cssText = 'margin-bottom: 20px; padding: 10px; background: var(--app-bg-secondary);';
    container.innerHTML = `
      <label style="font-size: 0.9em; font-weight: bold;">
        Game: <select style="padding: 4px 8px; margin-left: 8px;"></select>
      </label>
    `;

    const translationControls = document.getElementById('translationButtonsRow');
    if (translationControls && translationControls.parentElement) {
      translationControls.parentElement.insertBefore(container, translationControls);
    }

    return container;
  }

  /**
   * Handle game profile selection
   */
  private async selectGameProfile(profileId: string) {
    this.currentProfile = profileId;

    if (this.desktopBridge?.setGameProfile) {
      const success = await this.desktopBridge.setGameProfile(profileId);
      if (success) {
        console.log(`Selected profile: ${profileId}`);
        // Re-reflow existing translations if any
        if (this.extraction) {
          const statusMsg = document.getElementById('statusMessage');
          if (statusMsg) {
            statusMsg.textContent = `Profile changed. Re-reflowing translations...`;
          }
          // Request re-reflow  from main process
          if (this.desktopBridge?.reflowText) {
            await this.desktopBridge.reflowText(this.extraction.strings);
            this.renderTranslationTable();
          }
        }
      }
    }
  }

  /**
   * Handle progress updates from main process
   */
  private handleProgressUpdate(update: { message?: string; percentComplete?: number; type?: string }) {
    const statusMsg = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill') as HTMLElement;

    if (statusMsg) {
      statusMsg.textContent = update.message || '';
    }

    if (update.percentComplete !== undefined && progressFill) {
      progressFill.style.width = `${update.percentComplete}%`;
    }

    if (update.type === 'error') {
      console.error('Translation error:', update.message);
    }
  }

  /**
   * Handle extract button click
   */
  async extractText() {
    console.log('Extracting text from queued disks...');
    
    const statusEl = document.getElementById('extractionStatus');
    const statusMsg = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill') as HTMLElement;

    if (statusEl) statusEl.style.display = 'block';
    if (statusMsg) statusMsg.textContent = 'Extracting strings from disk images...';
    if (progressFill) progressFill.style.width = '0%';

    try {
      // Call main process to extract
      if (this.desktopBridge?.extractText) {
        const result = await this.desktopBridge.extractText();
        
        if (result.success) {
          // Validate extraction data
          if (Validation) {
            const validation = Validation.validateExtractionData(result);
            if (!validation.valid) {
              if (errorDialog) {
                errorDialog({
                  title: 'Invalid Extraction Data',
                  message: 'The extracted data contains errors:',
                  details: validation.errors.join('\n'),
                  type: 'error'
                });
              }
              return;
            }
          }

          // Store extraction data
          this.extraction = {
            totalStrings: result.totalStrings,
            disks: result.disks,
            strings: result.strings,
            byCategory: result.byCategory
          };

          if (statusMsg) {
            statusMsg.textContent = `✓ Extracted ${result.totalStrings} strings from ${result.disks.length} disks`;
          }

          if (Toast) {
            Toast.show(`Successfully extracted ${result.totalStrings} strings`, 'success');
          }

          this.updateStatistics();
          this.renderTranslationTable();
        } else {
          const errorMsg = result.error || 'Unknown error during extraction';
          if (statusMsg) statusMsg.textContent = `Error: ${errorMsg}`;
          
          if (errorDialog) {
            errorDialog({
              title: 'Extraction Error',
              message: 'Failed to extract strings from disks',
              details: errorMsg,
              type: 'error'
            });
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (statusMsg) statusMsg.textContent = `Error: ${errorMsg}`;
      
      if (errorDialog) {
        errorDialog({
          title: 'Extraction Failed',
          message: 'An unexpected error occurred during extraction',
          details: errorMsg,
          type: 'error'
        });
      }
      console.error('Extraction failed:', error);
    }
  }

  /**
   * Auto-translate all extracted strings
   */
  async autoTranslate() {
    if (!this.extraction) {
      if (Toast) {
        Toast.show('No extraction data. Click "Extract" first.', 'warning');
      } else {
        alert('No extraction data. Click "Extract" first.');
      }
      return;
    }

    const statusEl = document.getElementById('extractionStatus');
    const statusMsg = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill') as HTMLElement;

    if (statusEl) statusEl.style.display = 'block';
    if (statusMsg) statusMsg.textContent = 'Auto-translating and reflowing...';
    if (progressFill) progressFill.style.width = '0%';

    try {
      // Call main process to translate and reflow
      if (this.desktopBridge?.autoTranslate) {
        const result = await this.desktopBridge.autoTranslate(this.extraction.strings);

        if (result.success) {
          if (statusMsg) {
            statusMsg.textContent = `✓ Translated ${result.translated} strings, reflowed ${result.reflowed}`;
          }

          if (Toast) {
            Toast.show(`Translation complete: ${result.translated} strings, ${result.untranslatable} untranslatable`, 'success');
          }

          // Warn about untranslatable strings
          if (result.untranslatable > 0) {
            console.warn(`${result.untranslatable} strings could not be translated`);
          }

          this.updateStatistics();
          this.renderTranslationTable();
        } else {
          const errorMsg = result.error || 'Unknown error during translation';
          if (statusMsg) statusMsg.textContent = `Error: ${errorMsg}`;
          
          if (errorDialog) {
            errorDialog({
              title: 'Translation Error',
              message: 'Failed to auto-translate strings',
              details: errorMsg,
              type: 'error'
            });
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (statusMsg) statusMsg.textContent = `Error: ${errorMsg}`;
      
      if (errorDialog) {
        errorDialog({
          title: 'Auto-Translation Failed',
          message: 'An unexpected error occurred during translation',
          details: errorMsg,
          type: 'error'
        });
      }
      console.error('Auto-translate failed:', error);
    }
  }
  
  /**
   * Apply text reflow to a single string
   */
  private reflowString(str: TextString) {
    if (!this.reflowEngine || !str.translation) return;
    
    try {
      const constraint = this.reflowEngine.getConstraintFor(str.category, str.offset);
      const result = this.reflowEngine.reflowText(
        str.translation,
        constraint,
        str.originalText
      );
      
      str.wrapped = result.wrapped;
      str.wrappedLines = result.lines;
      str.reflowStatus = result.status;
    } catch (error) {
      console.error('Reflow error for', str.originalText, error);
      str.wrapped = str.translation;  // Fallback to unflowed
      str.reflowStatus = 'not_checked';
    }
  }

  /**
   * Simple contextual translations for demo (replace with API call)
   */
  private getContextualTranslation(japanese: string): string {
    const glossary: Record<string, string> = {
      // Menu/UI
      '新しいゲーム': 'New Game',
      'ゲーム再開': 'Continue Game',
      'ゲームを再開': 'Resume Game',
      'オプション': 'Options',
      'セーブ': 'Save',
      'セーブゲーム': 'Save Game',
      'ロード': 'Load',
      'ロードゲーム': 'Load Game',
      '終了': 'Exit',
      'やめる': 'Quit',

      // Combat
      '攻撃': 'Attack',
      'こうげき': 'Attack',
      '防御': 'Defend',
      'ぼうぎょ': 'Defend',
      '魔法': 'Magic',
      'まほう': 'Magic',
      'アイテム': 'Item',
      'アイテムを使う': 'Use Item',
      'ダメージ': 'Damage',
      'HP': 'HP',
      'MP': 'MP',

      // Status/Character
      'ステータス': 'Status',
      'キャラクター': 'Character',
      'そうび': 'Equipment',
      '装備': 'Equipment',
      'スキル': 'Skills',
      'けいけんち': 'Experience',
      '経験値': 'Experience',

      // Battle outcomes
      '勝利': 'Victory',
      '敗北': 'Defeat',
      '敵': 'Enemy',
      '味方': 'Ally',
      '逃走': 'Escape'
    };

    // Check glossary first
    if (glossary[japanese]) {
      return glossary[japanese];
    }

    // Use first 30 chars as fallback
    return japanese.substring(0, 30);
  }

  /**
   * Handle filter tab click
   */
  private handleFilterChange(e: Event) {
    const target = e.target as HTMLButtonElement;
    const category = target.dataset.category || 'all';

    // Update active tab
    document.querySelectorAll('.filterTab').forEach((tab) => {
      (tab as HTMLElement).classList.remove('active');
    });
    target.classList.add('active');

    // Filter and render
    this.currentFilter = category;
    this.applyFilter();
    this.renderTranslationTable();
  }

  /**
   * Apply category filter
   */
  private applyFilter() {
    if (!this.extraction) return;

    if (this.currentFilter === 'all') {
      this.filtered = this.extraction.strings;
    } else {
      this.filtered = this.extraction.strings.filter((s) => s.category === this.currentFilter);
    }
  }

  /**
   * Update statistics display
   */
  private updateStatistics() {
    if (!this.extraction) return;

    const total = this.extraction.strings.length;
    const translated = this.extraction.strings.filter((s) => s.translation && s.translation !== s.originalText).length;
    const verified = this.extraction.strings.filter((s) => s.verified).length;

    const totalEl = document.getElementById('statTotal');
    const translatedEl = document.getElementById('statTranslated');
    const verifiedEl = document.getElementById('statVerified');

    if (totalEl) totalEl.textContent = total.toString();
    if (translatedEl) translatedEl.textContent = translated.toString();
    if (verifiedEl) verifiedEl.textContent = verified.toString();
  }

  /**
   * Render bilingual translation table with wrapped preview
   */
  private renderTranslationTable() {
    const tbody = document.getElementById('translationRows');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!this.filtered || this.filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--app-ink-soft);">No strings to display</td></tr>';
      return;
    }

    this.filtered.forEach((str, idx) => {
      const row = document.createElement('tr');
      
      // Build wrapped preview
      const wrappedPreview = str.wrapped ? 
        `<code style="font-size: 0.85em; white-space: pre-wrap; word-break: break-word;">${this.escapeHtml(str.wrapped)}</code>${this.getReflowStatusIcon(str.reflowStatus)}` : 
        `<span style="color: var(--app-ink-soft);">—</span>`;
      
      row.innerHTML = `
        <td class="japaneseCell" style="width: 25%;"><small>${this.escapeHtml(str.offset)}</small><br/>${this.escapeHtml(str.originalText.substring(0, 20))}</td>
        <td class="englishCell" style="width: 25%;">
          <input 
            type="text" 
            class="translationInput" 
            data-index="${idx}"
            value="${this.escapeHtml(str.translation || '')}"
            placeholder="English..."
            style="width: 100%; padding: 4px;"
          />
        </td>
        <td style="width: 30%; font-family: monospace; font-size: 0.85em;">${wrappedPreview}</td>
        <td style="text-align: center; white-space: nowrap; width: 20%;">
          <span class="statusBadge ${str.verified ? 'verified' : str.translation ? 'manual' : 'pending'}">
            ${str.verified ? '✓' : str.translation ? '→' : '○'}
          </span>
        </td>
      `;

      // Add input change listener
      const input = row.querySelector('.translationInput') as HTMLInputElement;
      if (input) {
        input.addEventListener('change', (e) => this.handleTranslationEdit(e, str));
      }

      tbody.appendChild(row);
    });
  }

  /**
   * Handle manual translation edit
   */
  private handleTranslationEdit(e: Event, str: TextString) {
    const input = e.target as HTMLInputElement;
    const newTranslation = input.value.trim();

    if (newTranslation) {
      // Find the string in our extraction data and update it
      const originalIndex = this.extraction?.strings.indexOf(str);
      if (originalIndex !== undefined && this.extraction) {
        this.extraction.strings[originalIndex].translation = newTranslation;
        this.extraction.strings[originalIndex].verified = false;
        
        // Reflow the new translation
        this.reflowString(this.extraction.strings[originalIndex]);
        
        // Update wrapped preview
        const wrappedCell = input.parentElement?.nextElementSibling as HTMLElement;
        if (wrappedCell && this.extraction.strings[originalIndex].wrapped) {
          const wrapped = this.extraction.strings[originalIndex].wrapped;
          const statusIcon = this.getReflowStatusIcon(this.extraction.strings[originalIndex].reflowStatus);
          wrappedCell.innerHTML = `<code>${this.escapeHtml(wrapped)}</code>${statusIcon}`;
        }
      }

      // Update status indicator
      const row = input.closest('tr');
      if (row) {
        const statusBadge = row.querySelector('.statusBadge');
        if (statusBadge) {
          statusBadge.className = 'statusBadge manual';
          statusBadge.textContent = '→';
        }
      }

      this.updateStatistics();
    }
  }
  
  /**
   * Get HTML icon for reflow status
   */
  private getReflowStatusIcon(status?: string): string {
    switch (status) {
      case 'ok':
      case 'wrapped':
        return ' <span style="color: var(--app-green); font-weight: bold;">✓</span>';
      case 'truncated':
        return ' <span style="color: var(--app-yellow); font-weight: bold;">⚠️</span>';
      case 'overflow':
        return ' <span style="color: var(--app-red); font-weight: bold;">❌</span>';
      case 'needs_manual':
        return ' <span style="color: var(--app-orange); font-weight: bold;">⚠️</span>';
      default:
        return ' <span style="color: var(--app-ink-soft);">○</span>';
    }
  }

  /**
   * Save translations to JSON
   */
  async saveTranslations() {
    if (!this.extraction) {
      if (Toast) {
        Toast.show('No extraction data to save.', 'warning');
      } else {
        alert('No extraction data to save.');
      }
      return;
    }

    const translated = this.extraction.strings.filter((s) => s.translation && s.translation !== s.originalText).length;
    if (translated === 0) {
      if (Toast) {
        Toast.show('No translations to save. Translate strings first.', 'info');
      } else {
        alert('No translations to save. Translate strings first.');
      }
      return;
    }

    const statusEl = document.getElementById('extractionStatus');
    const statusMsg = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill') as HTMLElement;

    if (statusEl) statusEl.style.display = 'block';
    if (statusMsg) statusMsg.textContent = 'Saving translation project...';
    if (progressFill) progressFill.style.width = '0%';

    try {
      // Calculate statistics
      const statistics = {
        total: this.extraction.strings.length,
        translated: this.extraction.strings.filter((s) => s.translation && s.translation !== s.originalText).length,
        verified: this.extraction.strings.filter((s) => s.verified).length,
        byCategory: {} as Record<string, number>
      };

      for (const cat in this.extraction.byCategory) {
        statistics.byCategory[cat] = this.extraction.byCategory[cat].length;
      }

      // Call main process to save
      if (this.desktopBridge?.saveProject) {
        const result = await this.desktopBridge.saveProject({
          name: 'Alshark Translation',
          gameId: 'alshark-pc98',
          strings: this.extraction.strings,
          statistics
        });

        if (result.success) {
          if (statusMsg) {
            statusMsg.textContent = `✓ Project saved successfully`;
          }

          if (Toast) {
            Toast.show(`Project saved to ${result.filePath}`, 'success');
          }
        } else {
          const errorMsg = result.error || 'Unknown error';
          if (statusMsg) {
            statusMsg.textContent = `Error saving project: ${errorMsg}`;
          }

          if (errorDialog) {
            errorDialog({
              title: 'Save Failed',
              message: 'Could not save translation project',
              details: errorMsg,
              type: 'error'
            });
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (statusMsg) {
        statusMsg.textContent = `Error: ${errorMsg}`;
      }

      if (errorDialog) {
        errorDialog({
          title: 'Save Error',
          message: 'An unexpected error occurred while saving',
          details: errorMsg,
          type: 'error'
        });
      }
      console.error('Save failed:', error);
    }
  }

  /**
   * Apply translations back to disks
   */
  async applyTranslations() {
    if (!this.extraction) {
      if (Toast) {
        Toast.show('No translations to apply. Extract and translate first.', 'warning');
      } else {
        alert('No translations to apply. Extract and translate first.');
      }
      return;
    }

    const verified = this.extraction.strings.filter((s) => s.verified || s.translation).length;

    if (verified === 0) {
      if (Toast) {
        Toast.show('No translations. Translate strings first.', 'info');
      } else {
        alert('No translations to apply. Translate strings first.');
      }
      return;
    }

    const confirmed = confirm(`Apply ${verified} translations to disk images?\n\nThis will create patched disk files with your translations.\nOriginal files will be backed up with .backup extension.`);

    if (!confirmed) {
      return;
    }

    const statusEl = document.getElementById('extractionStatus');
    const statusMsg = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill') as HTMLElement;

    if (statusEl) statusEl.style.display = 'block';
    if (statusMsg) statusMsg.textContent = 'Applying translations to disk images...';
    if (progressFill) progressFill.style.width = '0%';

    try {
      // For now, just use a mock disk path
      // In a real implementation, this would ask user to select the disk
      const diskPath = 'Alshark (System disk).hdm';

      if (this.desktopBridge?.applyPatch) {
        const result = await this.desktopBridge.applyPatch({
          diskPath,
          strings: this.extraction.strings.filter((s) => s.translation)
        });

        if (result.success) {
          if (statusMsg) {
            statusMsg.textContent = `✓ Patched ${result.patched} strings. Backup saved.`;
          }

          if (Toast) {
            Toast.show(`Translation patch applied successfully! (${result.patched} strings)`, 'success');
          }

          alert(`Translation patch applied successfully!\n\nPatched: ${result.patched} strings\nBackup: ${result.backupPath}`);
        } else {
          const errorMsg = result.error || 'Unknown error';
          if (statusMsg) {
            statusMsg.textContent = `Error applying patch: ${errorMsg}`;
          }

          if (errorDialog) {
            errorDialog({
              title: 'Patch Failed',
              message: 'Could not apply translations to disk',
              details: errorMsg,
              type: 'error'
            });
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (statusMsg) {
        statusMsg.textContent = `Error: ${errorMsg}`;
      }

      if (errorDialog) {
        errorDialog({
          title: 'Patch Error',
          message: 'An unexpected error occurred while patching',
          details: errorMsg,
          type: 'error'
        });
      }
      console.error('Patch failed:', error);
    }
  }

  /**
   * Mock extraction data for demonstration
   */
  private mockExtractData() {
    this.extraction = {
      totalStrings: 252086,
      disks: [
        'Alshark (System disk).hdm',
        'Alshark (Data disk).hdm',
        'Alshark (Visual disk).hdm',
        'Alshark (Opening disk).hdm',
        'Alshark (Ending disk).hdm',
        'Alshark (User disk).hdm'
      ],
      strings: [
        {
          disk: 'Alshark (System disk).hdm',
          offset: '0x000082',
          originalText: 'あたらしいゲーム',
          translation: '',
          category: 'ui_menu',
          isJapanese: true
        },
        {
          disk: 'Alshark (System disk).hdm',
          offset: '0x00008a',
          originalText: 'ゲームをさいかいする',
          translation: '',
          category: 'ui_menu',
          isJapanese: true
        },
        {
          disk: 'Alshark (System disk).hdm',
          offset: '0x0000ec',
          originalText: 'オプション',
          translation: '',
          category: 'ui_menu',
          isJapanese: true
        },
        {
          disk: 'Alshark (System disk).hdm',
          offset: '0x0000f4',
          originalText: 'セーブ',
          translation: '',
          category: 'ui_menu',
          isJapanese: true
        },
        {
          disk: 'Alshark (System disk).hdm',
          offset: '0x0000fc',
          originalText: 'ロード',
          translation: '',
          category: 'ui_menu',
          isJapanese: true
        },
        {
          disk: 'Alshark (System disk).hdm',
          offset: '0x000104',
          originalText: '終了',
          translation: '',
          category: 'ui_menu',
          isJapanese: true
        },
        {
          disk: 'Alshark (Data disk).hdm',
          offset: '0x000200',
          originalText: 'こうげき',
          translation: '',
          category: 'combat_status',
          isJapanese: true
        },
        {
          disk: 'Alshark (Data disk).hdm',
          offset: '0x000208',
          originalText: 'ぼうぎょ',
          translation: '',
          category: 'combat_status',
          isJapanese: true
        },
        {
          disk: 'Alshark (Data disk).hdm',
          offset: '0x000210',
          originalText: 'まほう',
          translation: '',
          category: 'combat_status',
          isJapanese: true
        }
      ],
      byCategory: {
        ui_menu: [
          { disk: 'Alshark (System disk).hdm', offset: '0x000082', originalText: 'あたらしいゲーム', category: 'ui_menu', isJapanese: true },
          { disk: 'Alshark (System disk).hdm', offset: '0x00008a', originalText: 'ゲームをさいかいする', category: 'ui_menu', isJapanese: true }
        ],
        combat_status: [
          { disk: 'Alshark (Data disk).hdm', offset: '0x000200', originalText: 'こうげき', category: 'combat_status', isJapanese: true }
        ],
        dialog: [],
        name_item: [],
        other: []
      }
    };

    this.updateStatistics();
    this.applyFilter();
    this.renderTranslationTable();
  }

  /**
   * Escape HTML in strings
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

export { BilingualTranslationUI, TextString, ExtractionData };
