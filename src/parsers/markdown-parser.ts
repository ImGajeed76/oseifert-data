import * as yaml from 'yaml';
import type { ParsedMarkdown, MarkdownFrontmatter } from '../types';

export function parseMarkdown(content: string): ParsedMarkdown {
  // Extract frontmatter (between --- delimiters)
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const frontmatterMatch = content.match(frontmatterRegex);
  
  if (!frontmatterMatch) {
    throw new Error('No frontmatter found in markdown file');
  }

  const frontmatterYaml = frontmatterMatch[1];
  const bodyContent = content.slice(frontmatterMatch[0].length);

  // Parse YAML frontmatter
  const frontmatter = yaml.parse(frontmatterYaml) as MarkdownFrontmatter;

  // Extract description (between <!-- description --> and <!-- /description -->)
  const descriptionRegex = /<!--\s*description\s*-->([\s\S]*?)<!--\s*\/description\s*-->/i;
  const descriptionMatch = bodyContent.match(descriptionRegex);
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  // Extract content (between <!-- content --> and <!-- /content -->)
  const contentRegex = /<!--\s*content\s*-->([\s\S]*?)<!--\s*\/content\s*-->/i;
  const contentMatch = bodyContent.match(contentRegex);
  const mainContent = contentMatch ? contentMatch[1].trim() : '';

  // Validate required fields
  if (!frontmatter.title) {
    throw new Error('Missing required field: title');
  }
  if (!frontmatter.repoUrl) {
    throw new Error('Missing required field: repoUrl');
  }

  return {
    frontmatter,
    description,
    content: mainContent
  };
}