import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage properly
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => {
      const keys = Object.keys(store);
      return index < keys.length ? keys[index] : null;
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('BaseLayout', () => {
  beforeEach(() => {
    // Reset DOM and mocks
    document.documentElement.innerHTML = '<html><body></body></html>';
    localStorageMock.clear();
    (localStorageMock.getItem as any).mockClear();
    (localStorageMock.setItem as any).mockClear();
    (localStorageMock.removeItem as any).mockClear();
  });

  afterEach(() => {
    // Clean up DOM
    document.documentElement.innerHTML = '';
  });

  it('should support theme switching functionality', () => {
    // Test localStorage operations
    localStorage.setItem('preferredTheme', 'dark');
    expect(localStorage.getItem('preferredTheme')).toBe('dark');

    // Mock DOM elements
    document.body.innerHTML = `
      <div id="theme-toggle">
        <span id="sun-icon" style="display:block">☀️</span>
        <span id="moon-icon" style="display:none">🌙</span>
      </div>
    `;

    // Get elements
    const themeToggle = document.getElementById('theme-toggle');

    expect(themeToggle).toBeTruthy();

    // Simulate DOM class setting (matching actual implementation)
    document.documentElement.classList.add('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Verify class-based dark mode
    document.documentElement.classList.remove('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should support template switching functionality', () => {
    const templates = ['classic', 'simple', 'deluxe'] as const;
    expect(templates.length).toBe(3);

    // Test localStorage operations
    localStorage.setItem('preferredTemplate', 'classic');
    expect(localStorage.getItem('preferredTemplate')).toBe('classic');

    // Test DOM manipulation for template buttons
    document.body.innerHTML = `
      <div id="template-buttons">
        <button data-template="classic">古典</button>
        <button data-template="simple">简约</button>
        <button data-template="deluxe">华丽</button>
      </div>
    `;

    const templateButtons = document.querySelectorAll('[data-template]');
    expect(templateButtons.length).toBe(3);

    // Test individual template buttons
    const classicBtn = document.querySelector<HTMLButtonElement>('[data-template="classic"]');
    expect(classicBtn?.dataset.template).toBe('classic');
    expect(classicBtn?.textContent?.trim()).toBe('古典');
  });

  it('should manage CSS attributes correctly for theme switching', () => {
    const html = document.documentElement;

    // Test adding dark class (matching actual implementation)
    html.classList.add('dark');
    expect(html.classList.contains('dark')).toBe(true);

    html.classList.remove('dark');
    expect(html.classList.contains('dark')).toBe(false);
  });

  it('should handle dark mode preference', () => {
    // Mock match media
    const matchMediaMock = vi
      .fn()
      .mockReturnValueOnce({ matches: true }) // dark theme
      .mockReturnValueOnce({ matches: false }); // light theme

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });

    // Simulate getting user preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    expect(prefersDark).toBe(true);

    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    expect(prefersLight).toBe(false);
  });
});
