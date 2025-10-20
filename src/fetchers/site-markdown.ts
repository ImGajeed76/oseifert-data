import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseMarkdown } from '../parsers/markdown-parser';
import type { ParsedMarkdown } from '../types';

export interface MarkdownFile {
  filename: string;
  parsed: ParsedMarkdown;
}

export async function loadSiteMarkdownFiles(dataDir: string = 'data/site'): Promise<MarkdownFile[]> {
  const files: MarkdownFile[] = [];

  try {
    const entries = await readdir(dataDir);
    const markdownFiles = entries.filter(f => f.endsWith('.md'));

    for (const filename of markdownFiles) {
      const filePath = join(dataDir, filename);
      const content = await readFile(filePath, 'utf-8');
      
      try {
        const parsed = parseMarkdown(content);
        files.push({ filename, parsed });
        console.log(`✓ Loaded markdown file: ${filename}`);
      } catch (error) {
        console.error(`✗ Failed to parse ${filename}:`, error);
      }
    }

    return files;
  } catch (error) {
    console.error('Failed to load markdown files:', error);
    return [];
  }
}