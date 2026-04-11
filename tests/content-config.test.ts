import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';

// Replicate the schema logic from content.config.ts for unit testing
// (astro:content virtual module cannot be imported in vitest)
const gujiSchema = z.object({
  title: z.string(),
  docType: z.enum(['catalog', 'content']).default('content'),
  category: z.enum(['经部', '史部', '子部', '集部']).optional(),
  subcategory: z.string().optional(),
  author: z.string().optional(),
  dynasty: z.string().optional(),
  date: z.string().optional(),
  source: z.string().optional(),
});

describe('guji frontmatter schema', () => {
  it('should validate a minimal valid entry', () => {
    const result = gujiSchema.safeParse({ title: 'Test' });
    expect(result.success).toBe(true);
  });

  it('should validate a full content entry', () => {
    const entry = {
      title: '大学章句集注',
      docType: 'content' as const,
      category: '经部' as const,
      subcategory: '四书类',
      author: '朱熹',
      dynasty: '宋',
      date: '2026-04-11',
      source: '经部/大学章句集注.htm',
    };
    const result = gujiSchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('should validate a catalog entry', () => {
    const entry = {
      title: '列女传',
      docType: 'catalog' as const,
      category: '史部' as const,
      date: '2026-04-11',
      source: '史部-其他/列女传/index.htm',
    };
    const result = gujiSchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('should default docType to content', () => {
    const result = gujiSchema.safeParse({ title: 'Test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docType).toBe('content');
    }
  });

  it('should reject invalid docType', () => {
    const result = gujiSchema.safeParse({ title: 'Test', docType: 'book' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid category', () => {
    const result = gujiSchema.safeParse({ title: 'Test', category: '道部' });
    expect(result.success).toBe(false);
  });

  it('should accept all four valid categories', () => {
    const categories = ['经部', '史部', '子部', '集部'] as const;
    for (const cat of categories) {
      const result = gujiSchema.safeParse({ title: 'Test', category: cat });
      expect(result.success).toBe(true);
    }
  });

  it('should reject entries missing title', () => {
    const result = gujiSchema.safeParse({ category: '经部' });
    expect(result.success).toBe(false);
  });
});
