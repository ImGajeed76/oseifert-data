# Portfolio Data Fetcher 🚀

A modular, platform-agnostic portfolio data fetcher that supports multiple git platforms including GitHub, GitLab, Gitea, Forgejo, and Codeberg.

## Features ✨

- **Multi-Platform Support**: GitHub, GitLab, Gitea, Forgejo, Codeberg
- **Dual Mode Processing**: 
  - Curated projects with markdown descriptions
  - Auto-generated projects from all repositories
- **Rich Data Collection**: README, LICENSE, language stats, repository metadata
- **Smart Defaults**: Automatic fallbacks when data is unavailable
- **Type-Safe**: Full TypeScript implementation
- **Modular Architecture**: Clean separation of concerns

## Quick Start 🏃‍♂️

### Prerequisites

- [Bun](https://bun.sh) runtime
- GitHub token (required)
- Environment variables configured

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd oseifert-data

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your tokens and usernames
```

### Environment Variables

Create a `.env` file with:

```env
# Required
GH_TOKEN=ghp_xxxxxxxxxxxxx
GH_USERNAME=yourusername

# Optional
PRIMARY_PLATFORM=github
GITLAB_TOKEN=glpat-xxxxxxxxxxxxx
CODEBERG_TOKEN=xxxxxxxxxxxxx
```

### Usage

```bash
# Fetch portfolio data
bun run fetch

# Or run directly
bun run src/index.ts
```

## Project Structure 📁

```
src/
├── fetchers/
│   ├── git-platforms/
│   │   ├── base.ts              # Base interface for all platforms
│   │   ├── github.ts            # GitHub API client
│   │   ├── gitlab.ts            # GitLab API client
│   │   ├── gitea.ts             # Gitea/Forgejo/Codeberg client
│   │   └── index.ts             # Platform factory
│   ├── profile-stats.ts         # Profile statistics aggregator
│   └── site-markdown.ts         # Local markdown file loader
├── parsers/
│   ├── markdown-parser.ts       # YAML frontmatter + HTML comments
│   ├── url-parser.ts            # Git platform URL detection
│   └── project-transformer.ts   # Data transformation utilities
├── utils/
│   └── colors.ts                # Language color mapping
├── types/
│   └── index.ts                 # TypeScript interfaces
└── index.ts                     # Main orchestrator

data/
└── site/
    └── *.md                     # Curated project markdown files

public/
└── data/
    ├── curated-projects.json    # Handwritten projects with full content
    ├── all-projects.json        # All repositories (curated + auto-generated)
    └── profile-stats.json       # Aggregated profile statistics
```

## Curated Projects 📝

Create markdown files in `data/site/` to feature specific projects:

```markdown
---
title: "Project Title"
repoUrl: "https://github.com/user/repo"
liveUrl: "https://example.com"
role: "Solo Developer"
technologies: ["TypeScript", "React"]
status: "Active"
---

<!-- description -->
Short description of the project.
<!-- /description -->

<!-- content -->
## Full Project Details

Detailed markdown content about the project.
<!-- /content -->
```

## Output Format 📄

### Curated Projects (`curated-projects.json`)

Featured projects with full markdown content, sorted by last updated:

```json
[
  {
    "title": "Project Name",
    "portfolioUrl": "/projects/repo-name",
    "repoUrl": "https://github.com/user/repo",
    "liveUrl": "https://example.com",
    "description": "Short description",
    "role": "Solo Developer",
    "technologies": ["TypeScript", "React"],
    "status": "Active",
    "content": "Full markdown content...",
    "readme": "README.md content...",
    "license": { ... },
    "stats": { ... },
    "platform": { ... }
  }
]
```

### All Projects (`all-projects.json`)

All repositories with smart defaults:

```json
[
  {
    "title": "Auto Generated Title",
    "description": "Smart description from repo or README",
    "role": "Developer",
    "technologies": ["Python", "JavaScript"],
    "status": "Active",
    "isCurated": false,
    "readme": "...",
    "license": { ... },
    "stats": { ... },
    "platform": { ... },
    "topics": ["web", "api"],
    "isPrivate": false,
    "hasWiki": true,
    "hasPages": false
  }
]
```

### Profile Stats (`profile-stats.json`)

Aggregated statistics across all platforms:

```json
{
  "platforms": {
    "github": {
      "username": "user",
      "name": "Full Name",
      "publicRepos": 50,
      "followers": 100,
      ...
    }
  },
  "aggregated": {
    "totalRepos": 50,
    "totalStars": 200,
    "languageBreakdown": { ... },
    "mostUsedLanguages": [ ... ],
    "topRepositories": [ ... ],
    "licenseBreakdown": { ... }
  },
  "fetchedAt": "2025-01-20T10:30:00.000Z"
}
```

## Platform Support 🌐

### GitHub
- ✅ Full API support
- ✅ README, LICENSE, languages
- ✅ Repository metadata
- ✅ User profiles

### GitLab
- ✅ GitLab.com and self-hosted
- ✅ README, LICENSE, languages  
- ✅ Repository metadata
- ✅ User profiles

### Gitea/Forgejo/Codeberg
- ✅ Self-hosted Gitea/Forgejo
- ✅ Codeberg.org support
- ✅ README, LICENSE, languages
- ✅ Repository metadata
- ✅ User profiles

## Error Handling 🛠️

The system gracefully handles:

- Missing README or LICENSE files (404s are normal)
- Invalid repository URLs
- API rate limits and timeouts
- Malformed markdown files
- Network connectivity issues

404 errors in the logs are **expected and normal** - they occur when repositories don't have README or LICENSE files.

## Development 👩‍💻

### Adding a New Platform

1. Create a new client in `src/fetchers/git-platforms/`
2. Extend `BaseGitPlatformClient`
3. Implement all required methods
4. Add platform detection to `url-parser.ts`
5. Update the platform factory

### Modifying Output Structure

1. Update interfaces in `src/types/index.ts`
2. Modify transformers in `src/parsers/project-transformer.ts`
3. Update documentation

## Performance 🚀

- Parallel API requests where possible
- Efficient pagination for large repository lists
- Graceful fallbacks to reduce failed requests
- Progress indicators for long-running operations

## License 📜

This project is licensed under the terms specified in the repository.

---

Built with [Bun](https://bun.sh) ⚡