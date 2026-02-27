/**
 * ERROR DIALOG & FEEDBACK SYSTEM
 * Provides user-friendly error messages and progress feedback
 */

interface DialogOptions {
  title: string;
  message: string;
  details?: string;
  buttons?: string[];
  type?: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Show error dialog to user
 */
export function showErrorDialog(options: DialogOptions): void {
  const dialog = createDialog(options);
  // In Electron context, this would use dialog.showMessageBox
  // For now, show in-app modal
  document.body.appendChild(dialog);
}

/**
 * Create styled dialog element
 */
function createDialog(options: DialogOptions): HTMLElement {
  const dialog = document.createElement('div');
  dialog.className = 'app-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `;

  // Icon based on type
  const iconMap = {
    error: '❌',
    warning: '⚠️',
    success: '✓',
    info: 'ℹ️'
  };

  const icon = iconMap[options.type || 'info'];
  const colorMap = {
    error: '#d32f2f',
    warning: '#f57c00',
    success: '#388e3c',
    info: '#1976d2'
  };

  const titleColor = colorMap[options.type || 'info'];

  content.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="font-size: 32px; line-height: 1;">${icon}</div>
      <div style="flex: 1;">
        <h3 style="margin: 0 0 8px 0; color: ${titleColor}; font-size: 1.2em;">
          ${escapeHtml(options.title)}
        </h3>
        <p style="margin: 0 0 12px 0; color: #333; line-height: 1.5;">
          ${escapeHtml(options.message)}
        </p>
        ${options.details ? `
          <details style="margin: 12px 0 0 0; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 0.85em;">
            <summary style="cursor: pointer; font-weight: bold;">Details</summary>
            <pre style="margin: 8px 0 0 0; white-space: pre-wrap; word-break: break-word; color: #666;">
${escapeHtml(options.details)}
            </pre>
          </details>
        ` : ''}
      </div>
    </div>
    <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end;">
      ${(options.buttons || ['OK']).map((btn, i) => `
        <button 
          class="dialog-button"
          style="
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            font-size: 0.9em;
            cursor: pointer;
            background: ${i === (options.buttons?.length || 1) - 1 ? titleColor : '#e0e0e0'};
            color: ${i === (options.buttons?.length || 1) - 1 ? 'white' : 'black'};
          "
          data-action="${btn}"
        >${escapeHtml(btn)}</button>
      `).join('')}
    </div>
  `;

  dialog.appendChild(content);

  // Close on button click or click outside
  const closeDialog = () => dialog.remove();
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  content.querySelectorAll('.dialog-button').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  return dialog;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Validation utilities
 */
export const Validation = {
  /**
   * Validate translation string
   */
  validateTranslation(text: string, constraint: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!text || text.trim().length === 0) {
      errors.push('Translation cannot be empty');
    }

    if (constraint?.maxBytes && Buffer.byteLength(text, 'utf-8') > constraint.maxBytes) {
      errors.push(`Translation too long (${Buffer.byteLength(text, 'utf-8')} > ${constraint.maxBytes} bytes)`);
    }

    const lines = text.split('\n').length;
    if (constraint?.heightLines && lines > constraint.heightLines) {
      errors.push(`Too many lines (${lines} > ${constraint.heightLines})`);
    }

    // Check for dangerous characters
    if (/[\x00-\x1f]/.test(text)) {
      errors.push('Contains control characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Validate extraction data format
   */
  validateExtractionData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Invalid extraction data format');
      return { valid: false, errors };
    }

    if (!Array.isArray(data.strings)) {
      errors.push('Missing strings array');
    }

    if (!Array.isArray(data.disks)) {
      errors.push('Missing disks array');
    }

    if (typeof data.totalStrings !== 'number' || data.totalStrings < 0) {
      errors.push('Invalid totalStrings count');
    }

    // Check a few strings
    if (Array.isArray(data.strings) && data.strings.length > 0) {
      const sample = data.strings[0];
      if (!sample.originalText || !sample.category) {
        errors.push('Strings missing required fields (originalText, category)');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Validate game profile
   */
  validateProfile(profile: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!profile.id || typeof profile.id !== 'string') {
      errors.push('Profile missing or invalid id');
    }

    if (!profile.name || typeof profile.name !== 'string') {
      errors.push('Profile missing or invalid name');
    }

    if (!profile.encoding) {
      errors.push('Profile missing encoding');
    }

    if (!profile.textboxConstraints || typeof profile.textboxConstraints !== 'object') {
      errors.push('Profile missing textboxConstraints');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

/**
 * Progress bar renderer
 */
export class ProgressBar {
  private container: HTMLElement;
  private progressElement: HTMLElement;
  private messageElement: HTMLElement;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;

    // Create progress bar HTML
    container.innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="
          background: #e0e0e0;
          border-radius: 4px;
          height: 24px;
          overflow: hidden;
          border: 1px solid #ccc;
        ">
          <div 
            id="progressBar-fill" 
            style="
              background: linear-gradient(90deg, #4caf50, #66bb6a);
              height: 100%;
              width: 0%;
              transition: width 0.3s ease;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 0.8em;
              font-weight: bold;
            "
          ></div>
        </div>
      </div>
      <div id="progressBar-message" style="
        font-size: 0.9em;
        color: #666;
        text-align: center;
        min-height: 1.5em;
      "></div>
    `;

    this.progressElement = container.querySelector('#progressBar-fill') as HTMLElement;
    this.messageElement = container.querySelector('#progressBar-message') as HTMLElement;
  }

  /**
   * Update progress bar
   */
  update(percent: number, message?: string): void {
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    this.progressElement.style.width = `${percent}%`;

    if (message) {
      this.messageElement.textContent = message;
    } else if (percent === 100) {
      this.messageElement.textContent = '✓ Complete';
    } else {
      this.messageElement.textContent = `${Math.round(percent)}%`;
    }
  }

  /**
   * Complete the progress bar
   */
  complete(message?: string): void {
    this.update(100, message || '✓ Complete');
  }

  /**
   * Show error state
   */
  error(message: string): void {
    this.progressElement.style.background = 'linear-gradient(90deg, #f44336, #e53935)';
    this.messageElement.textContent = `❌ ${message}`;
  }
}

/**
 * Toast notification system
 */
export class Toast {
  static show(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration: number = 3000): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 16px 20px;
      border-radius: 4px;
      font-size: 0.9em;
      max-width: 400px;
      z-index: 9999;
      animation: slideIn 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;

    const colors = {
      info: '#2196f3',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800'
    };

    toast.style.background = colors[type];
    toast.style.color = 'white';
    toast.textContent = message;

    document.body.appendChild(toast);

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    if (!document.body.querySelector('style[data-toast-animation]')) {
      style.setAttribute('data-toast-animation', 'true');
      document.head.appendChild(style);
    }

    if (duration > 0) {
      setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }
}
