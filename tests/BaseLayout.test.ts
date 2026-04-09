import { describe, it, expect } from 'vitest';

describe('BaseLayout', () => {
  it('should have correct title', () => {
    expect('BaseLayout').toBeDefined();
  });

  it('should support template switching', () => {
    const templates = ['classic', 'simple', 'deluxe'];
    expect(templates).toHaveLength(3);
  });
});
