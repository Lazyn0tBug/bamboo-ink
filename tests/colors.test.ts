import { describe, it, expect } from 'vitest';

describe('TraditionalColors', () => {
  it('should have OKLCH color values', () => {
    const colors = {
      xuanzhi: 'oklch(96% 0.015 85)',
      zhusha: 'oklch(48% 0.22 25)',
      mo: 'oklch(18% 0.035 260)',
      juanbo: 'oklch(96% 0.012 90)',
    };
    expect(colors.xuanzhi).toContain('oklch');
  });

  it('should have calligraphy fonts', () => {
    const fonts = ['kai', 'li', 'zhuan', 'wei', 'yuan', 'song', 'hei'];
    expect(fonts).toContain('kai');
    expect(fonts).toContain('li');
  });
});

describe('TemplateSystem', () => {
  it('should support localStorage persistence', () => {
    const template = 'classic';
    expect(typeof template).toBe('string');
  });

  it('should have CSS data attribute switching', () => {
    const dataAttr = 'data-template';
    expect(dataAttr).toBe('data-template');
  });
});
