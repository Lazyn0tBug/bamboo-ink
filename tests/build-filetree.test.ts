import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildFileTree } from '../scripts/lib/build-filetree.mjs';

/**
 * Helper: create a temp directory with a mock 古籍 structure.
 */
function createMockSource(structure: Record<string, string[]>) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'filetree-test-'));

  for (const [category, files] of Object.entries(structure)) {
    const catDir = path.join(tmp, category);
    fs.mkdirSync(catDir, { recursive: true });
    for (const fileName of files) {
      // Handle nested: "subdir/file.htm"
      if (fileName.includes('/')) {
        const parts = fileName.split('/');
        const dir = path.join(catDir, ...parts.slice(0, -1));
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(catDir, fileName), '<html></html>');
    }
  }

  return tmp;
}

describe('buildFileTree', () => {
  it('should group files by category', () => {
    const tmp = createMockSource({
      '经部': ['论语.htm', '大学.htm'],
      '史部': ['史记.htm'],
    });

    const tree = buildFileTree(tmp);

    expect(Object.keys(tree.categories)).toContain('经部');
    expect(Object.keys(tree.categories)).toContain('史部');
    expect(tree.categories['经部'].length).toBe(2);
    expect(tree.categories['史部'].length).toBe(1);
  });

  it('should handle single-file books from direct .htm files', () => {
    const tmp = createMockSource({
      '经部': ['论语.htm', '大学.htm'],
    });

    const tree = buildFileTree(tmp);

    const books = tree.categories['经部'];
    const ids = books.map((b) => b.id);
    expect(ids).toContain('论语');
    expect(ids).toContain('大学');
    // Each should have exactly one file
    for (const book of books) {
      expect(book.files.length).toBe(1);
    }
  });

  it('should group subdirectory files into a single book entry', () => {
    const tmp = createMockSource({
      '经部': ['论语集注/学而.htm', '论语集注/为政.htm', '论语集注/八佾.htm'],
    });

    const tree = buildFileTree(tmp);

    const books = tree.categories['经部'];
    expect(books.length).toBe(1);
    expect(books[0].id).toBe('论语集注');
    expect(books[0].files.length).toBe(3);
  });

  it('should handle mixed direct files and subdirectories', () => {
    const tmp = createMockSource({
      '经部': [
        '中庸.htm',
        '大学.htm',
        '四書章句集注/大学章句.htm',
        '四書章句集注/中庸章句.htm',
      ],
    });

    const tree = buildFileTree(tmp);

    const books = tree.categories['经部'];
    expect(books.length).toBe(3);

    const singleFileIds = books.filter((b) => b.files.length === 1).map((b) => b.id);
    expect(singleFileIds).toContain('中庸');
    expect(singleFileIds).toContain('大学');

    const multiFileBook = books.find((b) => b.files.length > 1);
    expect(multiFileBook).toBeDefined();
    expect(multiFileBook!.id).toBe('四書章句集注');
  });

  it('should handle empty category directory', () => {
    const tmp = createMockSource({
      '经部': [],
    });

    const tree = buildFileTree(tmp);

    expect(tree.categories['经部']).toBeUndefined();
    expect(Object.keys(tree.categories).length).toBe(0);
  });

  it('should handle non-existent directory', () => {
    const tree = buildFileTree('/nonexistent/path/that/does/not/exist');

    expect(Object.keys(tree.categories).length).toBe(0);
  });

  it('should use relative paths from source root', () => {
    const tmp = createMockSource({
      '经部': ['论语.htm'],
    });

    const tree = buildFileTree(tmp);

    const book = tree.categories['经部'][0];
    expect(book.files[0]).toBe('经部/论语.htm'); // Relative to the source root
  });

  it('should set version and phase metadata', () => {
    const tmp = createMockSource({
      '经部': ['论语.htm'],
    });

    const tree = buildFileTree(tmp);

    expect(tree.version).toBe(1);
    expect(tree.phase).toBe('A');
    expect(tree.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should handle deeply nested subdirectories', () => {
    const tmp = createMockSource({
      '史部': ['廿五史/史记/本纪/五帝本纪.htm', '廿五史/汉书/高帝纪.htm'],
    });

    const tree = buildFileTree(tmp);

    const books = tree.categories['史部'];
    // Both "史记" and "汉书" are subdirectories under "廿五史"
    // But the scanner only goes one level — "廿五史" is a subdirectory,
    // and all .htm files under it are collected recursively
    expect(books.length).toBe(1);
    expect(books[0].id).toBe('廿五史');
    expect(books[0].files.length).toBe(2);
  });

  it('should sort categories and books alphabetically', () => {
    const tmp = createMockSource({
      '集部': ['楚辞.htm', '诗经.htm'],
      '经部': ['尚书.htm'],
      '史部': ['左传.htm'],
    });

    const tree = buildFileTree(tmp);

    const catKeys = Object.keys(tree.categories);
    // Sorted by Unicode code point: 史(U+53F2) < 经(U+7ECF) < 集(U+96C6)
    expect(catKeys).toEqual(['史部', '经部', '集部']);

    const bookIds = tree.categories['集部'].map((b) => b.id);
    // 诗(U+8BD7) < 楚(U+695A) — wait, actually 楚 < 诗 in code point? Let's check
    expect(bookIds).toEqual(bookIds.slice().sort()); // Just verify sorted
  });
});
