import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import type { BlogPost } from './types.ts';

interface BlogFrontmatter {
	title: string;
	slug: string;
	date: string;
	updated?: string;
	tags?: string[];
	projects?: string[];
	excerpt: string;
	draft?: boolean;
	externalUrl?: string;
}

/** Normalize a YAML date value to an ISO date string (YYYY-MM-DD) */
function normalizeDate(value: unknown): string {
	if (value instanceof Date) return value.toISOString().split('T')[0];
	return String(value);
}

/** Parse a single markdown file into a BlogPost */
function parseBlogFile(raw: string, filename: string): BlogPost {
	// Normalize CRLF to LF before parsing
	const normalized = raw.replace(/\r\n/g, '\n');
	const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!fmMatch) {
		throw new Error(`Invalid frontmatter in ${filename}`);
	}

	const frontmatter = parseYaml(fmMatch[1]) as BlogFrontmatter;
	const content = fmMatch[2].trim();

	if (!frontmatter.title || !frontmatter.slug || !frontmatter.date) {
		throw new Error(`Missing required frontmatter fields in ${filename} (need title, slug, date)`);
	}

	const wordCount = content.split(/\s+/).filter(Boolean).length;
	const readingTime = Math.max(1, Math.ceil(wordCount / 200));

	const isDraft = frontmatter.draft ?? false;
	const slug = isDraft ? `draft-${randomUUID()}` : frontmatter.slug;

	return {
		slug,
		title: frontmatter.title,
		excerpt: frontmatter.excerpt || '',
		date: normalizeDate(frontmatter.date),
		updated: frontmatter.updated ? normalizeDate(frontmatter.updated) : null,
		tags: frontmatter.tags || [],
		projects: frontmatter.projects || [],
		content,
		draft: isDraft,
		readingTime,
		externalUrl: frontmatter.externalUrl || null,
	};
}

/** Load all blog posts from data/blog/ directory */
export async function loadBlogPosts(blogDir: string): Promise<BlogPost[]> {
	let files: string[];
	try {
		files = await readdir(blogDir);
	} catch {
		console.warn(`Blog directory not found: ${blogDir}`);
		return [];
	}

	const mdFiles = files.filter((f) => f.endsWith('.md'));
	const posts: BlogPost[] = [];

	for (const file of mdFiles) {
		const raw = await readFile(join(blogDir, file), 'utf-8');
		try {
			const post = parseBlogFile(raw, file);
			posts.push(post);
		} catch (err) {
			console.error(`Error parsing ${file}:`, err);
		}
	}

	return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
