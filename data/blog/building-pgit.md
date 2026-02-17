---
title: "pgit: What If Your Git History Was a SQL Database?"
slug: building-pgit
date: "2026-02-16"
tags: [postgresql, git, compression, delta-encoding, go, open-source, ai-agents]
projects: []
excerpt: "I built a Git-like CLI backed by PostgreSQL with delta compression. It goes head-to-head with git gc --aggressive on storage while making your entire commit history SQL-queryable. Tested on 19 real repos, 193k commits."
draft: true
---

**TL;DR:** Built a Git-like CLI backed by PostgreSQL with automatic delta compression. Import any git repo, query its entire history with SQL. Benchmarked on 19 real repositories (193k commits): pgit goes head-to-head with `git gc --aggressive` on compression (9 wins, 9 losses, 1 tie) — while giving you full SQL access to every commit, file version, and change pattern. Then I gave an AI agent a single prompt and it produced a full codebase health report on Neon's own repo in under 10 minutes.

---

## What is pgit?

pgit is a Git-like version control CLI where everything lives in PostgreSQL instead of the filesystem. You get the familiar workflow — init, add, commit, push, pull, diff, blame — but your repository is a database. And that means your entire commit history is SQL-queryable.

```bash
pgit init
pgit import /path/to/your/repo --branch main
pgit sql "SELECT p.path, COUNT(*) as versions FROM pgit_file_refs f JOIN pgit_paths p ON p.group_id = f.group_id GROUP BY p.path ORDER BY versions DESC LIMIT 5"
```

<details>
<summary>What does this query do?</summary>

It joins each file reference to its path, counts how many versions (commits) exist per file, and returns the 5 most-modified files — your maintenance hotspots.
</details>

No scripts. No parsing `git log` output. No piping things through awk. Just SQL.

Want to know which files are always changed together? That's a coupling analysis — the kind of thing that usually requires custom tooling or expensive third-party services. With pgit, it's a query:

```sql
SELECT pa.path, pb.path, COUNT(*) as times_together
FROM pgit_file_refs a
JOIN pgit_paths pa ON pa.group_id = a.group_id
JOIN pgit_file_refs b ON a.commit_id = b.commit_id
  AND a.group_id < b.group_id
JOIN pgit_paths pb ON pb.group_id = b.group_id
GROUP BY pa.path, pb.path
ORDER BY times_together DESC
LIMIT 10;
```

<details>
<summary>What does this query do?</summary>

It finds every pair of files that were changed in the same commit (a self-join on `commit_id`), counts how often each pair appears together, and returns the top 10. The `a.group_id < b.group_id` condition avoids counting the same pair twice.
</details>

Under the hood, pgit uses [pg-xpatch](https://github.com/ImGajeed76/pg-xpatch), a PostgreSQL Table Access Method (basically a custom storage engine) that I built on top of my [xpatch](https://github.com/ImGajeed76/xpatch) delta compression library (I wrote about building xpatch [here](https://oseifert.ch/blog/building-xpatch)). When you insert file versions, pg-xpatch automatically stores only the deltas between consecutive versions. When you SELECT, it reconstructs the full content transparently. You just write normal SQL.

## Why Did I Build It?

After building xpatch — a delta compression library that hits [2-byte medians](https://oseifert.ch/blog/building-xpatch) on real code repositories — I kept asking myself: "Where could delta compression be useful where it isn't used yet?"

Databases were the obvious answer. Every application that stores versioned data — document editors, audit logs, config history — is keeping full copies of content that's 99% identical to the previous version. Delta compression could save massive amounts of storage, but nobody builds it into the database layer itself.

So I started building pg-xpatch: a proper PostgreSQL Table Access Method that does delta compression transparently. I tried SQLite first — but its extension API is limited and write performance with custom storage was painfully slow. PostgreSQL was a completely different story — the extension API is powerful, and the results were immediately promising.

But I needed to benchmark it. And from my xpatch work, I already knew that git history is the perfect test corpus: millions of incremental text changes across thousands of files, easy to obtain, representative of real-world editing patterns. So I started importing git repositories into PostgreSQL to stress-test the compression.

And at some point the benchmark tool became the actual project. That became pgit. And it turned out to be the best decision I could have made — not just as a product, but as dogfood. Running pgit against real repositories surfaced bugs, edge cases, and performance problems in pg-xpatch that no synthetic benchmark would have caught. Things like: what happens when a single file has 79,000 versions in one delta chain? What about repositories with 30,000+ files per commit? pg-xpatch now has 450+ tests and handles all of it without issues.

## Benchmarks: git vs pgit

Here's where it gets interesting. I benchmarked pgit against git on 19 real repositories across 6 languages (Rust, Go, Python, JavaScript, TypeScript, C), totaling 193,635 commits. The comparison is pgit's actual compressed data size versus `git gc --aggressive` packfile size — the best git can do.

**The scorecard: pgit 9 wins, git 9 wins, 1 tie.**

| Repository | Commits | Raw Size | git --aggressive | pgit | Winner |
|:-----------|--------:|---------:|-----------------:|-----:|:-------|
| serde | 4,352 | 203.5 MB | 5.6 MB | 3.9 MB | pgit (30%) |
| ripgrep | 2,207 | 111.8 MB | 3.0 MB | 2.9 MB | pgit (3%) |
| tokio | 4,394 | 195.5 MB | 8.3 MB | 7.7 MB | pgit (7%) |
| fzf | 3,482 | 209.2 MB | 3.4 MB | 2.7 MB | pgit (21%) |
| gin | 1,961 | 51.7 MB | 1.9 MB | 1.6 MB | pgit (16%) |
| flask | 5,506 | 165.6 MB | 6.0 MB | 5.5 MB | pgit (8%) |
| express | 6,128 | 150.0 MB | 5.8 MB | 5.2 MB | pgit (10%) |
| core (Vue) | 6,930 | 598.9 MB | 11.6 MB | 9.9 MB | pgit (15%) |
| curl | 37,818 | 3.3 GB | 48.4 MB | 45.0 MB | pgit (7%) |
| cli (GitHub) | 10,776 | 287.3 MB | 41.8 MB | 41.8 MB | tie |
| cargo | 21,833 | 1.2 GB | 29.8 MB | 30.3 MB | git (2%) |
| requests | 6,405 | 112.4 MB | 9.3 MB | 9.5 MB | git (2%) |
| svelte | 10,948 | 779.1 MB | 96.4 MB | 102.6 MB | git (6%) |
| react | 21,368 | 2.2 GB | 104.9 MB | 121.4 MB | git (16%) |
| redis | 12,936 | 2.0 GB | 71.6 MB | 76.9 MB | git (7%) |
| ruff | 14,116 | 2.8 GB | 51.0 MB | 56.6 MB | git (11%) |
| prettier | 11,084 | 2.0 GB | 66.2 MB | 96.4 MB | git (46%) |
| jq | 1,871 | 121.2 MB | 3.9 MB | 5.1 MB | git (31%) |
| hugo | 9,520 | 569.3 MB | 108.8 MB | 222.9 MB | git (105%) |

Let me put this in perspective. `git gc --aggressive` is git's best compression mode — it's significantly slower than normal `git gc` and is designed to squeeze out every byte. pgit **goes head-to-head with it on compression while making the entire history SQL-queryable**. And against normal `git gc` (the numbers are in the [full benchmark](https://github.com/ImGajeed76/pgit/blob/main/BENCHMARK.md)), pgit wins on the vast majority of repositories.

![Compression Ratio — higher is better](https://raw.githubusercontent.com/ImGajeed76/oseifert-data/master/data/blog/images/pgit-compression-ratio.png)

![Stored Size (MB) — lower is better](https://raw.githubusercontent.com/ImGajeed76/oseifert-data/master/data/blog/images/pgit-stored-size.png)

There's a clear pattern in the results. pgit wins on source-code-heavy repositories with incremental changes: serde, fzf, Vue core, express, curl. These are exactly the kind of repositories where delta compression shines — most commits change a few lines in a few files, and consecutive versions of each file are highly similar.

Git wins on repositories with large vendored dependencies, binary assets, or generated test fixtures: hugo, prettier, react. Hugo is the most extreme case (105% larger) because it vendors a lot of theme and asset files that are similar across different paths — git's packfile format can deduplicate across files (noticing that `vendor/foo.js` is similar to `vendor/bar.js`), while pgit compresses within each file's version chain independently.

I'm not going to pretend pgit beats git everywhere. It doesn't. pgit wins on source-code-heavy repos; git wins on repos with large vendored or binary content — and git's wins there tend to be larger in magnitude. But going head-to-head with git's *best* compression mode while adding full SQL queryability on top? I'll take that trade any day.

### It's Not Just About Storage

You might expect that storing everything in delta-compressed PostgreSQL tables would kill query performance. It doesn't. Here are real numbers on the **git/git repository** — 79,000 commits, 7,278 files:

| Command | Time |
|---------|------|
| show | 0.23s |
| diff | 0.18s |
| blame | 0.7s (warm cache), 7.3s (cold) |
| log | 1.5s |
| stats | 0.13s |

That's sub-second for most operations on a repository with 79k commits. The trick is working *with* pg-xpatch's storage model: use normal heap tables for metadata lookups (paths, refs, file hashes) and only touch delta-compressed tables when you need actual file content. Primary key lookups and front-to-back sequential scans are fast; JOINs onto compressed tables and `COUNT(*)` on delta chains are not.

This is documented in the [xpatch query patterns guide](https://github.com/ImGajeed76/pgit/blob/main/docs/xpatch-query-patterns.md) — worth reading if you work with any kind of columnar or compressed storage, since the principles apply broadly.

## Use Cases

pgit isn't trying to replace git for your daily development workflow. Git's ecosystem — GitHub, CI/CD, IDE integrations, merge tooling — is unmatched, and pgit doesn't compete with any of that.

What pgit does well is let you **understand** a codebase's history programmatically. Things like:

- **Coupling analysis**: which files always change together? (reveals hidden dependencies)
- **Churn detection**: which files have the most versions? (identifies maintenance hotspots)
- **Size trends**: how has the codebase grown over time? (tracks architectural health)
- **Bus factor**: which files have only one contributor? (knowledge silos)
- **Full-text search across history**: `pgit search "TODO" --path "*.rs" --all` searches every version of every file
- **Custom analytics**: any question you can express in SQL, you can answer

The most common analyses are built in — no SQL needed:

```bash
pgit analyze churn                    # most frequently modified files
pgit analyze coupling                 # files always changed together
pgit analyze hotspots --depth 2       # churn aggregated by directory
pgit analyze bus-factor               # files with fewest authors
pgit analyze activity --period month  # commit velocity over time
```

All of these support `--json` for programmatic consumption, `--path` for glob filtering, and display results in an interactive table. For anything beyond the built-ins, drop down to raw SQL with `pgit sql`.

These are the kinds of analyses that engineering teams either build custom tooling for, pay for expensive third-party services, or — most commonly — just don't do at all because the barrier is too high. With pgit, the barrier is a single command — or a SQL query if you need something custom.

## pgit for Agents

Here's what I think is the most interesting use case, and the one I'm most excited about.

AI coding agents are getting good. Really good. They can read code, write code, run tests, fix bugs. But there's one thing they're still bad at: understanding the *history* of a codebase. When an agent modifies a file, it doesn't know that this file has been reverted 5 times in the last month. It doesn't know that every time someone touches `tenant.rs`, they also need to update `timeline.rs`. It doesn't know that the function it's about to refactor has been growing by 20 lines per quarter for two years.

Agents already speak SQL — or at least, the models powering them can write it trivially. What they're missing is a SQL-queryable interface to git history.

To test this, I gave Claude Opus 4.6 a short prompt:

> Analyze the Neon database repository (https://github.com/neondatabase/neon) using pgit, a git-like CLI backed by PostgreSQL that makes git history SQL-queryable. It is globally installed. Import the repo and produce a short codebase health report covering: most frequently modified files, file pairs most often changed together, codebase size trends over time, and the largest current files. Refer to https://github.com/ImGajeed76/pgit/blob/main/docs/xpatch-query-patterns.md for SQL performance guidelines.

No step-by-step instructions. No hand-holding. Just a description of what I wanted.

In **9 minutes and 36 seconds**, it produced a full codebase health report. It figured out `pgit --help` on its own, imported the repository (8,471 commits), wrote optimized SQL queries following the performance guidelines, and delivered actionable findings:

**Most frequently modified files:**

| File | Versions |
|------|---------|
| Cargo.lock | 743 |
| pageserver/src/tenant/timeline.rs | 676 |
| test_runner/fixtures/neon_fixtures.py | 579 |
| pageserver/src/tenant.rs | 562 |
| pageserver/src/http/routes.rs | 434 |

**Strongest file coupling:**

| File A | File B | Co-changes |
|--------|--------|-----------|
| tenant.rs | timeline.rs | 289 |
| Cargo.lock | Cargo.toml | 257 |
| tenant.rs | http/routes.rs | 174 |
| image_layer.rs | delta_layer.rs | 104 |

**Largest files at HEAD:**

| File | Size |
|------|------|
| pageserver/src/tenant.rs | 476 KB |
| storage_controller/src/service.rs | 434 KB |
| pageserver/src/tenant/timeline.rs | 329 KB |

The agent's summary was genuinely insightful: "tenant.rs at 476 KB with 562 versions is the top candidate for decomposition." It spotted that the pageserver subsystem dominates every metric — churn, coupling, file size — and that development velocity has been accelerating, with Q1 2025 as the peak quarter (746 commits).

This isn't a hypothetical use case. This is a real agent, analyzing a real repository, producing real insights, with a 4-sentence prompt. And with `pgit analyze`, an agent doesn't even need to write SQL for the common cases — `pgit analyze churn --json` and `pgit analyze coupling --json` give it structured data directly. SQL is there when the agent needs to go deeper, but the built-in analyses lower the floor even further.

The combination of pgit's command-line interface, SQL escape hatch, and an agent's ability to reason over structured data makes codebase analysis something you can just *ask for*.

## What's Next

I'm happy with where pgit is. The compression holds up against git, the SQL interface works, and it's useful for real analysis — from manual queries to fully autonomous agent workflows. It does what I set out to make it do.

If you run into bugs or have a compelling feature idea, issues and PRs are welcome. The underlying pg-xpatch extension is the piece I'm most excited about long-term — it works for any versioned data (document editors, audit logs, config snapshots, CMS content history), and pgit is just one application of what a delta-compressed storage engine can do.

If you want to try pgit:

```bash
go install github.com/imgajeed76/pgit/v3/cmd/pgit@latest
```

- **pgit**: [github.com/ImGajeed76/pgit](https://github.com/ImGajeed76/pgit)
- **pg-xpatch**: [github.com/ImGajeed76/pg-xpatch](https://github.com/ImGajeed76/pg-xpatch)
- **xpatch**: [github.com/ImGajeed76/xpatch](https://github.com/ImGajeed76/xpatch)
- **Full benchmark results**: [BENCHMARK.md](https://github.com/ImGajeed76/pgit/blob/main/BENCHMARK.md)
