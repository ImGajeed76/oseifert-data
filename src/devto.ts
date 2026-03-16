import type { BlogPost } from './types.ts';

interface DevToArticle {
	id: number;
	title: string;
	description: string;
	url: string;
	published_at: string;
	edited_at: string | null;
	tag_list: string[];
	slug: string;
	reading_time_minutes: number;
	canonical_url: string | null;
}

interface DevToArticleFull extends DevToArticle {
	body_markdown: string;
}

/** Fetch a single article's full body */
async function fetchArticleBody(id: number): Promise<string> {
	try {
		const res = await fetch(`https://dev.to/api/articles/${id}`);
		if (!res.ok) return '';
		const data = (await res.json()) as DevToArticleFull;
		return data.body_markdown || '';
	} catch {
		return '';
	}
}

/** Fetch all published articles from dev.to for a given username */
export async function fetchDevToArticles(username: string): Promise<BlogPost[]> {
	const articles: DevToArticle[] = [];
	let page = 1;
	const MAX_PAGES = 50;

	while (page <= MAX_PAGES) {
		const res = await fetch(
			`https://dev.to/api/articles?username=${encodeURIComponent(username.toLowerCase())}&per_page=100&page=${page}`
		);
		if (!res.ok) {
			console.warn(`dev.to API returned ${res.status}`);
			break;
		}

		const data = (await res.json()) as DevToArticle[];
		if (data.length === 0) break;
		// Skip articles with a canonical URL pointing to oseifert.ch (already on the website)
		const exclusive = data.filter(
			(a) => !a.canonical_url || !a.canonical_url.includes('oseifert.ch')
		);
		articles.push(...exclusive);
		page++;
	}

	// Fetch full body for each article (needed for link scanning)
	const posts: BlogPost[] = [];
	for (const article of articles) {
		const body = await fetchArticleBody(article.id);
		posts.push({
			slug: `devto-${article.slug}`,
			title: article.title,
			excerpt: article.description || '',
			date: article.published_at.split('T')[0],
			updated: article.edited_at ? article.edited_at.split('T')[0] : null,
			tags: article.tag_list || [],
			projects: [],
			content: body,
			draft: false,
			readingTime: article.reading_time_minutes,
			externalUrl: article.url,
		});
	}

	return posts;
}
