---
title: "pgit: I Imported the Linux Kernel into PostgreSQL"
slug: linux-kernel-pgit
date: "2026-03-26"
tags: [postgresql, git, linux-kernel, compression, delta-encoding, go, open-source, data-analysis]
projects: [pgit-1143, pg-xpatch-1137, xpatch-1111]
excerpt: "I imported the entire Linux kernel git history into pgit's PostgreSQL-backed storage. 1,428,882 commits, 24.4 million file versions, 20 years of development. Here's what the kernel looks like when you can just ask."
draft: false
---

**TL;DR:** Imported the full Linux kernel history into pgit. 1,428,882 commits, 24.4 million file versions, 20 years of development, stored in PostgreSQL with delta compression. Actual data: 2.7 GB (git gc --aggressive gets 1.95 GB). The import took 2 hours on a dedicated server. Then I started asking questions. 7 f-bombs in 1.4 million commit messages (all from 2 people). 665 bug fixes pointing at a single commit. A filesystem that took 13 years to merge. Here's what the Linux kernel looks like as a SQL database.

---

## The import

This post builds on [pgit: What If Your Git History Was a SQL Database?](https://oseifert.ch/blog/building-pgit). If you haven't read it, start there. Short version: pgit is a Git-like CLI where everything lives in PostgreSQL instead of the filesystem. It uses [pg-xpatch](https://github.com/ImGajeed76/pg-xpatch) for transparent delta compression and makes your entire commit history SQL-queryable. After the pgit post hit the HN front page and got picked up by TLDR, console.dev, and dailydev, I teased that I was importing the Linux kernel. Here's what happened.

The Linux kernel is one of the largest actively developed repositories in the world. 1.4 million commits spanning 20 years, 171,000 files, 38,000 contributors. From what I've found, only a handful of VCS besides git have ever managed a full import of the kernel's history. Fossil (SQLite-based, by the SQLite team) never did. Darcs and Monotone attempted it with severe performance problems. Mercurial can do it. Correct me if I'm wrong on any of this.

pgit handled it.

| Metric | Value |
|:---|---:|
| Commits | 1,428,882 |
| File versions (file refs) | 24,384,844 |
| Unique blobs | 3,089,589 |
| Unique paths | 171,525 |
| Path groups (delta chains) | 137,600 |
| **Import time** | **2h 0m 48s** |

The import ran on a Hetzner dedicated server in Finland: AMD EPYC 7401P (24 cores / 48 threads), 512 GB DDR4 ECC RAM, 2×1.92 TB SSD in RAID 0. With a 350 GB xpatch content cache, the entire decoded repository fits in memory.

<details>
<summary>Full server setup, git baseline, and pgit configuration</summary>

### The server

Hetzner Dedicated "Server Auction" from their Finland datacenter (HEL1):

| Component | Spec |
|---|---|
| CPU | AMD EPYC 7401P (24 cores / 48 threads) |
| RAM | 16×32 GB DDR4 ECC reg. (512 GB total) |
| Storage | 2×Micron SSD SATA 1.92 TB Datacenter (RAID 0) |
| NIC | 1 Gbit Intel I350 |
| Cost | ~€272/month |

### OS installation

Hetzner `installimage` with Ubuntu 24.04 LTS. Two changes from the default config: RAID 0 (`SWRAIDLEVEL 0`) for maximum throughput (no redundancy needed for ephemeral analysis work), and a simple partition layout:

```
PART /boot ext3 1024M
PART swap swap 4G
PART / ext4 all
```

This gives ~3.5 TB usable storage across the two 1.92 TB SSDs.

### OS tuning

After booting into the installed image:

```bash
# --- Packages ---
apt update && apt upgrade -y
apt install -y \
  tmux btop htop iotop \
  cpufrequtils numactl \
  git curl wget unzip \
  build-essential \
  ufw \
  linux-tools-common linux-tools-$(uname -r)

# --- CPU governor → performance (all 48 threads) ---
for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    echo performance > "$cpu"
done
cat > /etc/default/cpufrequtils << 'EOF'
GOVERNOR="performance"
EOF
systemctl enable cpufrequtils
systemctl restart cpufrequtils

# --- Kernel mitigations off ---
sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT="consoleblank=0"/GRUB_CMDLINE_LINUX_DEFAULT="consoleblank=0 mitigations=off"/' /etc/default/grub.d/hetzner.cfg
update-grub

# --- sysctl ---
cat >> /etc/sysctl.conf << 'EOF'

vm.swappiness = 1
vm.dirty_ratio = 5
vm.dirty_background_ratio = 2
kernel.numa_balancing = 1
EOF
sysctl -p

# --- Disable Transparent Huge Pages ---
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag
cat > /etc/systemd/system/disable-thp.service << 'EOF'
[Unit]
Description=Disable Transparent Huge Pages
DefaultDependencies=no
After=sysinit.target local-fs.target
Before=basic.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled && echo never > /sys/kernel/mm/transparent_hugepage/defrag'

[Install]
WantedBy=basic.target
EOF
systemctl daemon-reload
systemctl enable disable-thp

# --- noatime ---
sed -i 's|relatime|noatime|g' /etc/fstab
mount -o remount,noatime /

# --- Firewall ---
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw --force enable

# --- Go 1.26.0 ---
wget https://go.dev/dl/go1.26.0.linux-amd64.tar.gz
rm -rf /usr/local/go && tar -C /usr/local -xzf go1.26.0.linux-amd64.tar.gz
rm go1.26.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc

# --- Docker ---
apt install -y docker.io
systemctl enable docker
systemctl start docker

# --- Reboot for mitigations ---
reboot
```

### pg-xpatch container

Pulled the standard latest pg-xpatch Docker image:

```bash
docker pull ghcr.io/imgajeed76/pg-xpatch:latest
```

### pgit version

pgit v4 with a few local changes that weren't released at the time of the import. By the time you're reading this, they should be included in the latest version, so everything here is reproducible with a normal `go install`. The main change is a `seq` ordering fix that replaces a monotonic timestamp hack with an explicit `seq INTEGER NOT NULL` column for commit ordering. This makes delta chain decompression significantly faster for sequential scans. Full changelist:

- **`db/schema.go`** — Added `seq INTEGER NOT NULL` column, `order_by => 'seq'` in `xpatch.configure()`
- **`db/commits.go`** — Added `Seq` field to struct, updated all INSERT/COPY statements
- **`cli/import.go`** — Populates `Seq` (1-indexed), removed monotonic timestamp hack
- **`repo/commit.go`** — `pgit commit` computes `MAX(seq)+1`, includes `seq` in INSERT
- **`cli/analyze.go`** — `--timeout` flag (replaces hardcoded 5min), `ORDER BY seq ASC` in queries
- **`cli/local.go`** — Shows actual container image instead of hardcoded `DefaultImage`
- **`container/runtime.go`** — New `GetContainerImage()` function
- Docs/text cleanup across README, sql.go, commits.go, ulid.go, config/reflect.go

### pgit configuration

```bash
# --- PostgreSQL core ---
pgit config --global container.shared_buffers 64GB
pgit config --global container.effective_cache_size 400GB
pgit config --global container.work_mem 256MB
pgit config --global container.wal_buffers 512MB
pgit config --global container.max_wal_size 32GB
pgit config --global container.checkpoint_timeout 60min
pgit config --global container.max_connections 50
pgit config --global container.port 5433
pgit config --global container.shm_size 450g

# --- Parallelism (24c/48t EPYC 7401P) ---
pgit config --global container.max_worker_processes 28
pgit config --global container.max_parallel_workers 24
pgit config --global container.max_parallel_per_gather 12

# --- xpatch content cache (350 GB) ---
pgit config --global container.xpatch_cache_size_mb 358400            # 350 GB
pgit config --global container.xpatch_cache_max_entries 41000000      # 31.5M needed + 30%
pgit config --global container.xpatch_cache_max_entry_kb 16384        # 16 MB max single entry
pgit config --global container.xpatch_cache_slot_size_kb 4            # default, fine for mixed sizes
pgit config --global container.xpatch_cache_partitions 24             # one per core

# --- xpatch sub-caches ---
pgit config --global container.xpatch_group_cache_size_mb 256         # 85K groups need 4 MB (62×)
pgit config --global container.xpatch_tid_cache_size_mb 4096          # 25.8M rows need 1.1 GB (3.7×)
pgit config --global container.xpatch_seq_tid_cache_size_mb 4096      # 25.8M rows need 1.5 GB (2.7×)

# --- xpatch insert / encoding ---
pgit config --global container.xpatch_insert_cache_slots 256          # 24 workers × concurrent groups
pgit config --global container.xpatch_encode_threads 2                # ×24 workers = 48 HW threads
pgit config --global container.xpatch_warm_cache_workers 24           # one per core

# --- Import ---
pgit config --global import.workers 24
```

### Configuration rationale

| Parameter | Value | Reasoning |
|---|---|---|
| `shared_buffers` | 64 GB | Dataset ~20 GB on disk, 3× headroom, entire DB fits in buffer pool |
| `effective_cache_size` | 400 GB | Hint to planner: shared_buffers + OS page cache + xpatch caches |
| `work_mem` | 256 MB | Per-op memory for sorts/hash joins; 50 connections × 256 MB = 12.8 GB worst case |
| `wal_buffers` | 512 MB | Absorb write bursts during bulk import |
| `max_wal_size` | 32 GB | Delay checkpoints during heavy writes |
| `checkpoint_timeout` | 60 min | Minimize I/O stalls from forced checkpoints |
| `shm_size` | 450 GB | 64 GB shared_buffers + 350 GB cache + 8 GB sub-caches + ~2 GB internals ≈ 425 GB, rounded up |
| `xpatch_cache_size_mb` | 350 GB | Estimated decoded footprint ~55 GB, 84% headroom ensures everything fits |
| `xpatch_cache_max_entries` | 41M | 1.4M commits × 5 delta cols + 24.4M file versions = 31.5M worst case, +30% padding |
| `xpatch_encode_threads` | 2 | ×24 workers = 48 encoding threads, matching 48 HW threads exactly |
| `import.workers` | 24 | One per physical core |

### Git baseline measurements

Before importing, we cloned the kernel and measured the raw git repository:

```bash
cd /root
git clone --single-branch --branch master https://github.com/torvalds/linux.git
cd /root/linux

git rev-list --count HEAD                                              # 1,428,882
git gc --quiet && du -sb .git/objects/pack/*.pack                      # 6,213,222,259 (5.79 GB)
git cat-file --batch-all-objects --batch-check='%(objecttype) %(objectsize)' \
  | awk '{sum += $2} END {printf "%.2f GB\n", sum/1024/1024/1024}'     # 144.43 GB
time git fast-export --reencode=yes --show-original-ids master \
  > /root/linux.fastexport                                             # 17m18s, 126 GB
time git gc --aggressive --quiet && du -sb .git/objects/pack/*.pack    # 24m46s, 2,093,181,079 (1.95 GB)
```

| Metric | Value |
|---|---|
| Commits | 1,428,882 |
| Raw uncompressed object size | 144.43 GB |
| Packfile after `git gc` | 5.79 GB |
| Packfile after `git gc --aggressive` | 1.95 GB |
| `git gc --aggressive` time | 24m 46s (338m CPU) |
| Fast-export size | 126 GB |
| Fast-export time | 17m 18s |

### The import

Started the pg-xpatch container with `pgit local start` (the start check times out because allocating 450 GB of shared memory takes a while, but it starts eventually). Waited for the database to be ready with `docker logs pgit-local -f`.

```bash
cd /root/linux-analysis
pgit init
time pgit import /root/linux --branch master --fastexport /root/linux.fastexport
```

| Phase | Time |
|---|---|
| Commit import | 39m 57s |
| Commit graph build | 13s (max depth 75,641) |
| Path group computation | 9.6s (137,600 groups from 171,525 paths) |
| Blob import | 1h 17m |
| Index rebuild | 38s |
| **Total** | **2h 0m 48s** (wall), 336m 50s CPU, 21m 12s sys |

</details>

## Compression

Let's be honest about the numbers.

| | Size | Ratio |
|:---|---:|---:|
| Raw uncompressed objects | 144.43 GB | 1.0x |
| **pgit (on-disk)** | **6.6 GB** | **21.9x** |
| git gc (normal) | 5.79 GB | 24.9x |
| **pgit (actual data)** | **2.7 GB** | **53.5x** |
| git gc --aggressive | 1.95 GB | 74.1x |

git gc --aggressive wins. 1.95 GB vs pgit's 2.7 GB of actual data. About 38% smaller.

This is expected. The Linux kernel is basically git's dream scenario for cross-object delta compression: massive code reuse across architectures, SPDX license headers duplicated in 70,000+ files, and 70% of all files are .c/.h with shared patterns across completely unrelated subsystems. git's packfile format can delta-compress any object against any other object in the entire repository, regardless of file path. pgit compresses within file-level delta chains.

What pgit does get: 114.4x compression on text content alone. xpatch compressed 123 GB of source text into 1.1 GB. The other 1.6 GB is metadata (which file is in which commit, path mappings, refs). Only 52 binary blobs exist in the entire kernel history. It's almost entirely text.

But the comparison isn't really about bytes. `git gc --aggressive` takes 25 minutes and gives you a packfile. pgit takes 2 hours and gives you a SQL database. The question is what you can do after.

<details>
<summary>Full on-disk breakdown</summary>

| Component | Size |
|---|---|
| Commits (xpatch) | 600.6 MB |
| Text content (xpatch) | 1.3 GB |
| Binary content (xpatch) | 2.0 MB |
| File refs (heap) | 2.1 GB |
| Paths (heap) | 13.2 MB |
| Other (refs, metadata, sync) | 40.0 KB |
| Indexes | 2.7 GB |
| **Total on disk** | **6.6 GB** |

| Layer | Size |
|---|---|
| xpatch (commits + text + binary) | 1.5 GB |
| Normal tables (file_refs, paths, refs, metadata) | 1.2 GB |
| **Actual data** | **2.7 GB** |
| PostgreSQL overhead + indexes | 3.9 GB |

*Note: The second table strips PostgreSQL overhead from each component, so the rows won't sum to match the on-disk table above.*

171,525 paths collapsed into 137,600 delta groups (rename/copy detection). 7.9x blob deduplication: 24.4M file refs point to only 3.1M unique content versions.

</details>

## What 1.4 million commits reveal

Everything below was queried directly from PostgreSQL. Most queries completed in under 10 seconds. No materialized views, no preprocessing, no scripts parsing `git log` output. Just SQL on delta-compressed tables.

### 38,506 authors. 36% never came back.

The kernel has 38,506 unique authors (by email) but only 1,540 unique committers. In the kernel's mailing list workflow, you write a patch and a maintainer merges it. So 38,506 people wrote code, but only 1,540 had merge authority. A 25:1 ratio.

Nearly 14,000 of those authors contributed exactly one patch and never came back.

### 90% of commits touch 5 files or fewer

| Files Touched | Commits | % of total |
|:---|---:|---:|
| 1 file | 875,541 | 61.3% |
| 2-5 files | 414,018 | 29.0% |
| 6-10 files | 70,951 | 5.0% |
| 11-50 files | 49,700 | 3.5% |
| 51+ files | 18,523 | 1.3% |

The kernel's "one logical change per commit" rule holds up. The largest single commit touched 53,003 files, but every single one of the top 5 biggest commits turned out to be merge commits from subsystem maintainers. Not sweeping API changes. Just plumbing.

### File coupling: the hidden dependencies

`pgit analyze coupling` computes which files always change together. This is the kind of analysis that's painful to do with git (parsing `git log` output, building co-change matrices, filtering noise) but trivial when your history is a SQL database. On 1.4 million commits, it completed in 48 seconds.

| File A | File B | Co-changes |
|:---|:---|---:|
| `i915/intel_drv.h` | `i915/intel_display.c` | **1,117** |
| `net/core/dev.c` | `include/linux/netdevice.h` | **1,087** |
| `i915/i915_gem.c` | `i915/i915_drv.h` | **1,072** |
| `arch/x86/kvm/x86.c` | `arch/x86/include/asm/kvm_host.h` | **1,066** |
| `include/uapi/linux/bpf.h` | `tools/include/uapi/linux/bpf.h` | 742 |
| `net/ipv4/tcp_ipv4.c` | `net/ipv6/tcp_ipv6.c` | 739 |

The Intel i915 GPU driver owns the top spot: `intel_drv.h` and `intel_display.c` have been changed together 1,117 times. The i915 driver appears 8 times in the top 30 coupled pairs.

The most interesting entry: `include/uapi/linux/bpf.h` and `tools/include/uapi/linux/bpf.h` at 742 co-changes. Every kernel BPF header change requires a manual copy to the tools directory. And `tcp_ipv4.c` with `tcp_ipv6.c` at 739: fixing a TCP bug in IPv4 almost always means the same fix in IPv6.

<details>
<summary>Full coupling top 15</summary>

| Rank | File A | File B | Co-changes |
|---|---|---|---|
| 1 | `i915/intel_drv.h` | `i915/intel_display.c` | 1,117 |
| 2 | `net/core/dev.c` | `include/linux/netdevice.h` | 1,087 |
| 3 | `i915/i915_gem.c` | `i915/i915_drv.h` | 1,072 |
| 4 | `arch/x86/kvm/x86.c` | `arch/x86/include/asm/kvm_host.h` | 1,066 |
| 5 | `i915/intel_display.c` | `i915/i915_drv.h` | 892 |
| 6 | `include/net/cfg80211.h` | `net/wireless/nl80211.c` | 783 |
| 7 | `mlx5/core/en_main.c` | `mlx5/core/en.h` | 778 |
| 8 | `fs/btrfs/inode.c` | `fs/btrfs/ctree.h` | 776 |
| 9 | `fs/btrfs/ctree.h` | `fs/btrfs/extent-tree.c` | 769 |
| 10 | `fs/btrfs/disk-io.c` | `fs/btrfs/ctree.h` | 757 |
| 11 | `include/uapi/linux/bpf.h` | `tools/include/uapi/linux/bpf.h` | 742 |
| 12 | `net/ipv4/tcp_ipv4.c` | `net/ipv6/tcp_ipv6.c` | 739 |
| 13 | `i915/i915_drv.c` | `i915/i915_drv.h` | 739 |
| 14 | `sound/soc/codecs/Makefile` | `sound/soc/codecs/Kconfig` | 674 |
| 15 | `net/mac80211/ieee80211_i.h` | `net/mac80211/mlme.c` | 670 |

Btrfs has 7 entries in the top 30, all radiating from `ctree.h`. That single header is the coupling hub of the entire Btrfs filesystem.

</details>

### Three people merge 22.5% of all commits

| Committer | Patches Merged | Self-Authored | Merge Ratio |
|:---|---:|---:|---:|
| David S. Miller | 113,456 | 15,617 | 7.3x |
| Greg Kroah-Hartman | 105,733 | 7,073 | 15.0x |
| Linus Torvalds | 102,322 | 45,125 | 2.3x |

David S. Miller (networking) is the single busiest merge point: 7.9% of all kernel commits flow through him. Greg Kroah-Hartman authored 7K patches but merged 106K. 15:1. John W. Linville is even more lopsided: 18.9K merged, 1.1K written. 16.5:1.

<details>
<summary>Full committer table (top 10)</summary>

| Committer | Patches Merged | Self-Authored | Merge Ratio |
|---|---|---|---|
| David S. Miller | 113,456 | 15,617 | 7.3x |
| Greg Kroah-Hartman | 105,733 | 7,073 | 15.0x |
| Linus Torvalds | 102,322 | 45,125 | 2.3x |
| Mark Brown | 49,674 | 8,759 | 5.7x |
| Mauro Carvalho Chehab | 39,869 | 6,571 | 6.1x |
| Alex Deucher | 37,053 | 4,201 | 8.8x |
| Ingo Molnar | 27,870 | 5,648 | 4.9x |
| Jakub Kicinski | 24,509 | 5,036 | 4.9x |
| Jens Axboe | 19,985 | 3,758 | 5.3x |
| John W. Linville | 18,882 | 1,146 | 16.5x |

</details>

### Who pays for the kernel

| Organization | Commits | Authors | Commits/Author |
|:---|---:|---:|---:|
| Intel | 83,187 | 1,704 | 49 |
| Red Hat | 72,695 | 658 | **110** |
| kernel.org | 69,451 | 227 | **306** |
| Linaro | 43,524 | 263 | 166 |
| AMD | 42,270 | 1,017 | 42 |
| SUSE | 35,711 | 222 | 161 |
| Google | 29,276 | 809 | 36 |
| Huawei | 24,156 | 540 | 45 |
| Amazon | 1,688 | 121 | **14** |

Intel is #1 by volume (83K commits, 1,704 engineers). Red Hat is #2 but with the most productive team: 110 commits per engineer. The kernel.org maintainers (227 people) average 306 commits each. These are the elite core.

Amazon stands out at the bottom: 14 commits per person. They're focused on Xen/KVM virtualization for AWS, not broad kernel work. (Note: IBM shows only 53 commits because their engineers use `@linux.ibm.com` and `@linux.vnet.ibm.com`, landing them in the "Other" bucket. Similarly, many Huawei engineers use `@hisilicon.com`.)

Individual contributors (Gmail addresses, a proxy for hobbyists) peaked at 12% of all commits in 2010. By 2025, that's down to 8%. The absolute numbers are stable (~7K/year), but the kernel has become more corporate over time.

<details>
<summary>Gmail vs corporate trend over time</summary>

| Year | Gmail Commits | Total | Gmail % |
|---|---|---|---|
| 2005 | 452 | 16,696 | 2% |
| 2008 | 5,604 | 48,847 | 11% |
| 2010 | 6,091 | 49,819 | **12%** (peak) |
| 2014 | 8,602 | 75,659 | 11% |
| 2018 | 7,393 | 80,330 | 9% |
| 2022 | 7,438 | 86,810 | 8% |
| 2025 | 7,160 | 85,163 | 8% |

</details>

### The "buggiest" commit in Linux history

The kernel has a convention: the `Fixes:` tag in a commit message references the exact commit that introduced a bug. By 2026, more than 1 in 4 commits use it (up from basically zero before 2013).

The commit with the most Fixes: references? `1da177e4c3f4`. Linus Torvalds's initial git import. April 16, 2005. **665 bug fixes pointing back at it.**

It's not actually buggy. When a bug has existed "forever" and there's no specific commit to blame, developers cite `1da177e4c3f4` as shorthand for "this was always broken."

The second-most-fixed: `dd08ebf6c352`, Intel's Xe GPU driver introduction. 196 fixes in ~2 years. One bug fix every 4 days since the driver landed.

### Polite commits, angry code

7 f-bombs in 1.4 million commit messages. All from exactly 2 people: Al Viro (5) and Linus Torvalds (2).

But the source code tells a different story. `pgit search "fuck" --path "*.c" --path "*.h"` found 8 matches in the current codebase. Running the same search with `--all` (every version of every file across 20 years of history) found 50+ matches in 44 seconds. Highlights:

- *"Am I fucking pedantic or what?"* (SCSI driver header, still in the code today)
- *"Ugly, ugly fucker."* (netfilter header, present since the very first commit, survived 20 years of code review)
- *"fucking gcc"* (XFS B-tree header, twice)
- *"If you fuck with this, update ret_from_syscall code too"* (SPARC architecture)

<details>
<summary>Full profanity count in commit messages</summary>

These counts are from **commit messages only**, not source code. Using PostgreSQL word boundary regex (`\y`) to avoid false positives ("ass" matching "class", "hell" matching "shell"):

| Word | Count | Notes |
|---|---|---|
| workaround | 8,435 | Not profanity, but reveals pain: 8,435 times someone couldn't fix the real problem |
| hack | 2,438 | The kernel's honest self-assessment |
| ugly | 2,161 | |
| stupid | 533 | |
| crap | 268 | |
| damn | 81 | |
| shit | 29 | |
| fuck | 7 | |

And in the source code, some gems:

| File | Comment |
|---|---|
| `sound/oss/forte.c` | *"FIXME HACK FROM HELL!"* |
| `arch/powerpc/sysdev/todc.c` | *"XXXX BAD HACK -> FIX"* (×4, and it was copied to `arch/ppc/syslib/todc_time.c` without being fixed) |
| `drivers/staging/dgap/` (5 files) | `NOTE TO LINUX KERNEL HACKERS: DO NOT REFORMAT THIS CODE!` |

</details>

### Triple reverts

Only 3 commits in all of Linux history are triple reverts (a revert of a revert of a revert).

Greg KH on Lustre (the HPC filesystem): **"How many times can we do this..."**

Linus on a memory management flag: *"This is a revert of a revert of a revert."* The i915 GPU driver was using a flag it shouldn't have been, and untangling it took three revert cycles.

All three are in memory management or staging. Subsystems where changes have far-reaching, hard-to-predict effects.

### Kent Overstreet: 13 years, one filesystem

Kent Overstreet's first kernel commit was in 2011: bcache, a block cache layer. By 2013 it was in mainline with 213 commits. Then he went quiet. 4 to 34 commits per year from 2014 to 2017, rewriting the whole thing out-of-tree into a full filesystem.

In 2023, bcachefs merged into mainline (kernel 6.7). 904 commits that year. 1,194 the next. He codes on New Year's Day across 3 different years, between 1am and 4am. 27% of his commits are on weekends. When the merge was controversial, he kept going.

<details>
<summary>More kernel stories</summary>

**Weekend warriors:**

| Author | Weekend Commits | Total | Weekend % |
|---|---|---|---|
| Jonathan Cameron | 1,176 | 2,295 | **51.2%** |
| Christophe JAILLET | 1,061 | 2,086 | **50.9%** |
| Kent Overstreet | 1,415 | 5,217 | 27.1% |
| Hans de Goede | 1,394 | 4,627 | 30.1% |
| Linus Torvalds | 10,729 | 45,274 | 23.7% |

Jonathan Cameron and Christophe JAILLET do more than half their kernel work on weekends. They're hobby contributors maintaining drivers in their free time.

**Single-file devotees:**

Connor McAdams's entire kernel career (89 commits) is a single Creative Labs sound card driver (`patch_ca0132.c`). Lydia Wang (63 commits) lived in the VIA audio codec. Two separate people, Pavel Rojtberg and Cameron Gutman, independently devoted their kernel contributions exclusively to the Xbox controller driver (`xpad.c`).

**Career journeys:**

James Bottomley (SCSI maintainer) has committed from **19 different email domains** over 20 years. His git log IS his resume: SteelEye → HP → Parallels → Odin → and more. Linus has 12 domains. David S. Miller has 11.

**Christmas Day commits:**

The kernel has never had a zero-commit Christmas in 21 years. 2008 had 157 commits on December 25th (the x86 unification frenzy). Even on the quietest Christmas (2005, 1 commit), someone was working.

**The busiest single day:**

November 18, 2022: 662 commits. One person (Uwe Kleine-König) did **583 of them** in a mass `platform_driver` return type conversion. The second busiest was January 30, 2008 (640 commits): three developers sustaining 600+ commits/day for three consecutive days during the x86 unification.

**Commit message culture gap:**

Jeff Garzik averages 161 bytes per commit message. Filipe Manana (Btrfs) averages 1,950 bytes. A 12x gap. The entire memory management subsystem (`mm/`) skews verbose: its top 3 contributors are all in the top 5 longest-message writers. When your bugs are subtle and catastrophic, you explain yourself.

**GPU drivers are revert magnets:**

drm/amd/display (191 reverts) + drm/amdgpu (127) + drm/i915 (147) = 516 GPU reverts, nearly 10% of all reverts in the entire kernel. Display code has complex hardware interactions, power management state machines, and regression-sensitive userspace APIs.

</details>

## Query performance

All of the above was queried on a 1.4 million commit database. Here's how long things took:

| Query | Time |
|:---|---:|
| Stats + compression info | 2.1s |
| Churn (24.4M file refs) | 2.3s |
| Hotspots | 1.8s |
| Coupling (computed in Go) | 48.3s |
| Authors (full commit scan) | 34.3s |
| Activity (yearly) | 9.4s |
| Day-of-week / hour-of-day | 4.2-4.4s |
| Full-text search (current files) | 25s |
| Full-text search (all history) | 44s |

No materialized views. No preprocessing. Just SQL on PostgreSQL with pg-xpatch delta compression.

<details>
<summary>All SQL commands used in this analysis</summary>

```bash
# Storage & compression (2.1s)
pgit stats --xpatch

# Churn (2.3s)
pgit analyze churn --limit 30

# Hotspots (1.8s)
pgit analyze hotspots --depth 1 --limit 25

# Authors (34.3s)
pgit analyze authors --limit 30 --timeout 60m

# Activity (9.4s)
pgit analyze activity --period year --limit 25 --timeout 60m

# Coupling (48.3s)
pgit analyze coupling --limit 30 --timeout 60m

# Merge hierarchy (4.6s)
pgit sql "SELECT committer_name, COUNT(*) as merged,
  SUM(CASE WHEN author_name = committer_name THEN 1 ELSE 0 END) as self_authored
  FROM pgit_commits GROUP BY committer_name ORDER BY merged DESC LIMIT 15"

# Corporate contributions (5.4s)
pgit sql "SELECT
  CASE
    WHEN author_email LIKE '%%@intel.com' THEN 'Intel'
    WHEN author_email LIKE '%%@redhat.com' THEN 'Red Hat'
    WHEN author_email LIKE '%%@kernel.org' THEN 'kernel.org'
    -- ... (full domain mapping)
  END as org,
  COUNT(*) as commits, COUNT(DISTINCT author_email) as authors
  FROM pgit_commits GROUP BY org ORDER BY commits DESC"

# Fixes: tag evolution (4.5s)
pgit sql "SELECT EXTRACT(YEAR FROM authored_at)::int as year,
  SUM(CASE WHEN message ~* 'Fixes:\s+[0-9a-f]{12}' THEN 1 ELSE 0 END) as fixes_commits,
  COUNT(*) as total
  FROM pgit_commits GROUP BY year ORDER BY year"

# Most-fixed commits (4.9s)
pgit sql "SELECT SUBSTRING(message FROM 'Fixes:\s+([0-9a-f]{12})') as broken_commit,
  COUNT(*) as times_fixed
  FROM pgit_commits
  WHERE message ~* 'Fixes:\s+[0-9a-f]{12}'
  GROUP BY broken_commit ORDER BY times_fixed DESC LIMIT 10"

# Profanity with word boundaries (~5s)
pgit sql "WITH words(word) AS (VALUES ('fuck'),('shit'),('damn'),('stupid'),('crap'),('ugly'),('hack'),('workaround'))
  SELECT w.word, COUNT(*) as cnt
  FROM pgit_commits c, words w
  WHERE c.message ~* ('\y' || w.word || '\y')
  GROUP BY w.word ORDER BY cnt DESC"

# Source code search
pgit search "fuck" --path "*.c" --path "*.h"
pgit search "fuck" --path "*.c" --path "*.h" --all

# Triple reverts (5.7s)
pgit sql "SELECT author_name, authored_at::date, LEFT(message, 200)
  FROM pgit_commits
  WHERE message ILIKE 'Revert \"Revert \"Revert%%'"

# Kent Overstreet trajectory (4.1s)
pgit sql "SELECT EXTRACT(YEAR FROM authored_at)::int as year, COUNT(*)
  FROM pgit_commits WHERE author_name = 'Kent Overstreet'
  GROUP BY year ORDER BY year"

# Weekend warriors (1m 41s)
pgit sql "SELECT author_name, COUNT(*) as weekend_commits,
  (SELECT COUNT(*) FROM pgit_commits c2 WHERE c2.author_name = c.author_name) as total
  FROM pgit_commits c WHERE EXTRACT(DOW FROM authored_at) IN (0, 6)
  GROUP BY author_name ORDER BY weekend_commits DESC LIMIT 15"
```

</details>

## Links

pgit can handle the Linux kernel. That was the question I wanted to answer. It imported, it compressed, and it made 20 years of history queryable in seconds.

Since the pgit post, [ripgit](https://github.com/deathbyknowledge/ripgit) was built on top of xpatch: a self-hostable git remote backed by Cloudflare Durable Objects with SQLite storage and delta compression. It's wild to see the ecosystem growing.

```bash
go install github.com/imgajeed76/pgit/v4/cmd/pgit@latest
```

- **pgit**: [github.com/ImGajeed76/pgit](https://github.com/ImGajeed76/pgit)
- **pg-xpatch**: [github.com/ImGajeed76/pg-xpatch](https://github.com/ImGajeed76/pg-xpatch)
- **xpatch**: [github.com/ImGajeed76/xpatch](https://github.com/ImGajeed76/xpatch)
