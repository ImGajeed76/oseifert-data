/**
 * Discovery engine — computes pairwise dissimilarity between all pages
 * using TF-IDF + cosine similarity, then outputs a ranked list per page
 * for the "Discover more" feature on the frontend.
 */

import type { Project, BlogPost } from './types.ts';

// ── Types ──────────────────────────────────────────────────────────────

export interface DiscoveryEntry {
	slug: string;
	type: 'project' | 'blog';
	pinned: boolean;
	score: number; // dissimilarity: 0 = identical, 1 = completely different
}

export type DiscoveryMap = Record<string, DiscoveryEntry[]>;

interface PageDoc {
	slug: string;
	type: 'project' | 'blog';
	pinned: boolean;
	tokens: string[];
}

// ── Stop words ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
	'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
	'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
	'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
	'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'this',
	'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
	'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our',
	'their', 'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
	'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
	'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
	'just', 'about', 'above', 'after', 'again', 'also', 'any', 'because',
	'before', 'between', 'during', 'here', 'there', 'into', 'if', 'then',
	'out', 'up', 'over', 'under', 'through', 'while', 'am', 'an', 'nor',
	'yet', 'get', 'got', 'new', 'use', 'used', 'using', 'make', 'made',
]);

// ── Tokenizer ──────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// ── Build page documents ───────────────────────────────────────────────

function projectToDoc(p: Project): PageDoc {
	// Repeat title 3x and topics 2x for weight
	const parts: string[] = [
		p.title, p.title, p.title,
		p.description,
		...p.topics, ...p.topics,
		...p.languages.map((l) => l.name),
		...p.languages.map((l) => l.name),
		// First ~500 words of README
		p.readme.split(/\s+/).slice(0, 500).join(' '),
	];

	return {
		slug: p.slug,
		type: 'project',
		pinned: p.pinned,
		tokens: tokenize(parts.join(' ')),
	};
}

function blogToDoc(b: BlogPost): PageDoc {
	const parts: string[] = [
		b.title, b.title, b.title,
		b.excerpt,
		...b.tags, ...b.tags,
		// First ~500 words of content
		b.content.split(/\s+/).slice(0, 500).join(' '),
	];

	return {
		slug: b.slug,
		type: 'blog',
		pinned: false,
		tokens: tokenize(parts.join(' ')),
	};
}

// ── TF-IDF ─────────────────────────────────────────────────────────────

type TfIdfVector = Map<string, number>;

function computeTF(tokens: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const t of tokens) {
		counts.set(t, (counts.get(t) || 0) + 1);
	}
	const len = tokens.length || 1;
	const tf = new Map<string, number>();
	for (const [term, count] of counts) {
		tf.set(term, count / len);
	}
	return tf;
}

function computeIDF(docs: Map<string, number>[]): Map<string, number> {
	const docCount = docs.length;
	const df = new Map<string, number>();

	for (const tf of docs) {
		for (const term of tf.keys()) {
			df.set(term, (df.get(term) || 0) + 1);
		}
	}

	const idf = new Map<string, number>();
	for (const [term, count] of df) {
		idf.set(term, Math.log(docCount / count));
	}
	return idf;
}

function computeTfIdf(tf: Map<string, number>, idf: Map<string, number>): TfIdfVector {
	const vec: TfIdfVector = new Map();
	for (const [term, tfVal] of tf) {
		const idfVal = idf.get(term) || 0;
		const score = tfVal * idfVal;
		if (score > 0) {
			vec.set(term, score);
		}
	}
	return vec;
}

// ── Cosine similarity ──────────────────────────────────────────────────

function cosineSimilarity(a: TfIdfVector, b: TfIdfVector): number {
	let dot = 0;
	let magA = 0;
	let magB = 0;

	for (const [term, valA] of a) {
		magA += valA * valA;
		const valB = b.get(term);
		if (valB !== undefined) {
			dot += valA * valB;
		}
	}

	for (const valB of b.values()) {
		magB += valB * valB;
	}

	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	if (denom === 0) return 0;
	return dot / denom;
}

// ── Main entry point ───────────────────────────────────────────────────

export function generateDiscovery(
	projects: Project[],
	blogPosts: BlogPost[]
): DiscoveryMap {
	// 1. Build documents
	const docs: PageDoc[] = [
		...projects.map(projectToDoc),
		...blogPosts.filter((b) => !b.draft && !b.externalUrl).map(blogToDoc),
	];

	console.log(`  Computing TF-IDF for ${docs.length} pages...`);

	// 2. Compute TF per document
	const tfs = docs.map((d) => computeTF(d.tokens));

	// 3. Compute IDF across all documents
	const idf = computeIDF(tfs);

	// 4. Compute TF-IDF vectors
	const vectors = tfs.map((tf) => computeTfIdf(tf, idf));

	// 5. Compute pairwise dissimilarity and build ranked lists
	const discovery: DiscoveryMap = {};

	for (let i = 0; i < docs.length; i++) {
		const entries: DiscoveryEntry[] = [];

		for (let j = 0; j < docs.length; j++) {
			if (i === j) continue;

			const similarity = cosineSimilarity(vectors[i], vectors[j]);
			const dissimilarity = Math.round((1 - similarity) * 1000) / 1000; // 3 decimal places

			entries.push({
				slug: docs[j].slug,
				type: docs[j].type,
				pinned: docs[j].pinned,
				score: dissimilarity,
			});
		}

		// Sort by dissimilarity descending (most different first)
		entries.sort((a, b) => b.score - a.score);

		discovery[docs[i].slug] = entries;
	}

	// Stats
	const avgEntries = Object.values(discovery).reduce((s, e) => s + e.length, 0) / docs.length;
	console.log(`  Generated discovery map: ${docs.length} pages, ~${Math.round(avgEntries)} suggestions each`);

	return discovery;
}
