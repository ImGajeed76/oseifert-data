import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import type { BlogPost } from './types.ts';
import { rewriteMediaUrls } from './utils/media-urls.ts';

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

/** Generate a deterministic, truncated SHA-256 hex hash of the given input */
function hashSlug(slug: string): string {
	return createHash('sha256').update(slug).digest('hex').slice(0, 12);
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

	// Exclude <details> blocks from word count — they're collapsible extras,
	// not part of the main reading flow
	const visibleContent = content.replace(/<details>[\s\S]*?<\/details>/g, '');
	const wordCount = visibleContent.split(/\s+/).filter(Boolean).length;
	const readingTime = Math.max(1, Math.ceil(wordCount / 200));

	const isDraft = frontmatter.draft ?? false;
	const slug = isDraft ? `draft-${hashSlug(frontmatter.slug)}` : frontmatter.slug;

	// Rewrite embedded media URLs so relative paths (e.g. ./images/foo.png)
	// resolve to raw.githubusercontent.com in this repo.
	// Blog files live under data/blog/, so relative paths need that prefix.
	const rewrittenContent = rewriteMediaUrls(
		content,
		'ImGajeed76',
		'oseifert-data',
		'master',
		'data/blog',
	);

	return {
		slug,
		title: frontmatter.title,
		excerpt: frontmatter.excerpt || '',
		date: normalizeDate(frontmatter.date),
		updated: frontmatter.updated ? normalizeDate(frontmatter.updated) : null,
		tags: frontmatter.tags || [],
		projects: frontmatter.projects || [],
		content: rewrittenContent,
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
