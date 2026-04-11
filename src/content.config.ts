import { defineCollection } from 'astro:content';
import { z } from 'zod/v4';

export const guji = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    docType: z.enum(['catalog', 'content']).default('content'),
    category: z.enum(['经部', '史部', '子部', '集部']).optional(),
    subcategory: z.string().optional(),
    author: z.string().optional(),
    dynasty: z.string().optional(),
    date: z.string().optional(),
    source: z.string().optional(),
  }),
});

export const collections = {
  guji,
};
