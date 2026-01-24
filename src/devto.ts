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
}

/** Fetch all published articles from dev.to for a given username */
export async function fetchDevToArticles(username: string): Promise<BlogPost[]> {
	const articles: DevToArticle[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`https://dev.to/api/articles?username=${username.toLowerCase()}&per_page=100&page=${page}`
		);
		if (!res.ok) {
			console.warn(`dev.to API returned ${res.status}`);
			break;
		}

		const data = (await res.json()) as DevToArticle[];
		if (data.length === 0) break;
		articles.push(...data);
		page++;
	}

	return articles.map((article) => ({
		slug: `devto-${article.slug}`,
		title: article.title,
		excerpt: article.description || '',
		date: article.published_at.split('T')[0],
		updated: article.edited_at ? article.edited_at.split('T')[0] : null,
		tags: article.tag_list || [],
		projects: [],
		content: '',
		draft: false,
		readingTime: article.reading_time_minutes,
		externalUrl: article.url,
	}));
}
