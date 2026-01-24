# oseifert-data

Data generator for my portfolio website. Fetches repos from GitHub (+ GitLab/Gitea), pulls dev.to articles, and outputs `projects.json` + `blog-posts.json`.

## Usage

```bash
bun install
GH_TOKEN=xxx GH_USERNAME=xxx bun run fetch
```

Output goes to `public/data/`.

## Blog posts

Local posts live in `data/blog/*.md` with YAML frontmatter. Dev.to articles are fetched automatically.
