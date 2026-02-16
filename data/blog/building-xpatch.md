---
title: "xpatch: Building a Delta Compressor That Hits 2-Byte Medians"
slug: building-xpatch
date: "2025-12-11"
updated: "2025-12-28"
tags: [rust, performance, compression, open-source, simd, delta-encoding]
projects: [xpatch-1111]
excerpt: "Needed tiny deltas for an encrypted document format. Built xpatch with 7 specialized algorithms and a tag system that references old versions. Result: median delta of 2 bytes on real code repositories, tested on 1.2 million real-world changes."
draft: false
---

**TL;DR:** Needed tiny deltas for an encrypted document format. xdelta3 uses 40+ bytes for simple edits. Built xpatch with 7 specialized algorithms and a tag system that references old versions. Result: median delta of 2 bytes on real code repositories. Yes, 2 bytes. Tested on 1.2 million real-world changes. Available for Rust, Python, Node.js, C/C++, and WebAssembly. It's fast as hell and actually works.

---

The median delta is 2 bytes.

Not a typo. Two bytes. That's a uint16. That's the header plus literally nothing else because the files being compared are identical and the algorithm just says "hey, go look at version 5, it's the same."

Let me show you how I ended up here, because it started with a much simpler problem and turned into a three-week rabbit hole that I'm genuinely excited about.

## The Problem That Broke Me

I'm building a document format. The requirements list reads like a wish list from hell: E2EE, realtime collaboration, full version history, offline-first sync, and it all needs to actually work without requiring a dedicated server farm.

Here's the catch that makes everything complicated: you can't compress after encryption. Once you encrypt a delta, that's it. No more compression opportunities. Which means every single delta needs to be tiny, or storage costs will murder you before you even launch.

I started with Myers diff. You know, the classic. It's elegant, it's well-tested, it works. But for the kinds of micro-edits you get when capturing changes every 500ms? Way too verbose. Storing "user added 5 characters" was taking dozens of bytes.

I moved to xdelta3. Better. Actually pretty good for larger changes. But still burning 40+ bytes just to encode "hello" → "hello world". That's 8x overhead on a 6-byte change. Not going to work.

Then I found gdelta. There's this research paper from 2021 called "Exploring the Potential of Fast Delta Encoding" and it looked promising. Fast, good compression on small files, exactly what I needed. Problem: the only implementation was three-year-old research code with Python bindings that barely compiled.

So I did what any reasonable developer would do at 2 AM: said "fuck it, I'll rewrite it in Rust." Two weeks later, https://github.com/ImGajeed76/gdelta exists and actually works. It's fast, it's efficient, the algorithm is solid.

But I kept staring at the output. Simple edits were still around 20 bytes. And I couldn't stop thinking: "Why? Why do I need 20 bytes to store the fact that someone typed 'hello'?"

That question wouldn't leave me alone.

## The Realization That Changed Everything

Most document edits aren't random. They follow patterns. Really predictable patterns:

- **Adding text**: "hello" becomes "hello world"
- **Deleting text**: "hello world" becomes "hello"
- **Reverting changes**: "hello" → "hello world" → "hello" (classic "actually no" moment)
- **Repeating patterns**: "test test test", indentation, decorators
- **Everything else**: the actual complex structural changes

General-purpose algorithms like xdelta3 or gdelta try to handle all of these with one approach. They're built for the worst case - arbitrary binary changes, no assumptions about the data.

But what if you don't have to make one algorithm that handles everything? What if you could have specialized algorithms for each pattern, try them all, and just pick whichever produces the smallest result?

That's when I started building xpatch.

## Building It: The Simple Stuff First

### Algorithm 1: Just Store The Damn Characters

The most common case is adding text. So I just... store it.

```rust
fn encode_add(position: usize, data: &[u8]) -> Vec<u8> {
    let mut encoded = encode_varint(position);
    encoded.extend_from_slice(data);
    encoded
}
```

That's it. Position where the insertion happens (variable-length integer so small positions use less space), then the actual characters. Adding "world" at position 6? About 6 bytes total.

Compare to gdelta's 20+ bytes for the same change. Already winning.

### Algorithm 2: Deletion Is Even Simpler

```rust
fn encode_remove(start: usize, end: usize) -> Vec<u8> {
    let mut encoded = encode_varint(start);
    encoded.extend(encode_varint(end - start));
    encoded
}
```

Two numbers: where it starts, how much to remove. Fixed overhead of about 3 bytes for typical positions. You literally cannot make deletion more compact than this without getting into bitpacking nonsense.

### Algorithm 3: Wait, What If We Tokenize This?

Here's where I went a little crazy.

Text isn't random characters. It's words. Common words appear all the time. What if instead of storing "hello world" as 11 bytes, we could store it as two token references?

So I built a tokenizer. The wordlist is exactly 2^14 tokens (16,384 words) because that's the sweet spot for varint encoding - small token IDs fit in one byte, larger ones in two. Sorted by frequency so common words get the smallest IDs.

The data structure is a trie with array-indexed children:

```rust
struct TrieNode {
    token_id: Option<usize>,
    children: [Option<Box<TrieNode>>; 256],
}

fn find_longest_match(&self, text: &[u8], start: usize) -> Option<(usize, usize)> {
    let mut node = &self.root;
    let mut last_match = None;
    let mut pos = start;

    while pos < text.len() {
        // Direct array indexing - O(1) lookup per byte
        if let Some(next_node) = &node.children[text[pos] as usize] {
            node = next_node;
            pos += 1;
            
            if let Some(token_id) = node.token_id {
                last_match = Some((token_id, pos - start));
            }
        } else {
            break;
        }
    }
    
    last_match
}
```

No HashMap overhead, just direct array access. O(1) per byte. Greedy longest-match means it always picks the biggest token it can find.

The best part? If tokenization produces a larger result than just storing the characters raw, it automatically falls back to the Chars algorithm. No tradeoff. You always get the smaller encoding.

### Algorithm 4 & 5: Pattern Detection

Spotted "aaaaaaa" in the text? Don't store 7 bytes. So I added pattern detection that stores this instead:

```rust
// [position][repeat_count][pattern]
// "aaaaaaa" = [alog + tag][7]["a"] = 3 bytes
```

Works for single characters and for token patterns. If someone writes "test test test test", you don't need to store "test" four times. Store it once and say "repeat this 4 times."

I optimized pattern detection too. It checks powers of 2 first (1, 2, 4, 8, 16, 32, 64) because they're fastest to verify with bitwise operations and they're super common in code.

### Algorithm 6 & 7: The "Fuck It, Use The Real Algorithm" Option

For complex changes - scattered edits, structural rewrites, cases where nothing else works - I fall back to gdelta. It's a proper general-purpose delta compressor, and it's good at its job.

There's also a GDeltaZstd variant that adds zstd compression on top of gdelta. Slower to encode, but sometimes you get significant size wins. Worth trying.

### The Selection Logic

So how does it actually pick? Here's the code:

```rust
let (best_algo, best_data) = match analyze_change(base_data, new_data) {
    ChangeType::ContinuousAdd { position, data } => {
        // Start with simple character encoding
        let mut best_algo = Algorithm::Chars;
        let mut best_data = encode_add(position, &data[..]);
        
        // Try tokenization - might be smaller
        if let Ok(token_data) = encode_tokens(position, &data[..])
            && token_data.len() < best_data.len()
        {
            best_algo = Algorithm::Tokens;
            best_data = token_data;
        }
        
        // Check for repeating patterns
        if let Some((pattern, repeat_count)) = detect_repeating_pattern(&data[..])
            && repeat_count >= 2
        {
            // Try both character and token-based repetition
            // Pick whichever is smaller
        }
        
        (best_algo, best_data)
    }
    ChangeType::ContinuousRemove { start, end } => {
        (Algorithm::Remove, encode_remove(start, end))
    }
    ChangeType::Complex => {
        // Try gdelta with and without zstd, pick the winner
    }
};
```

Try all the algorithms that make sense for the change type, pick whichever produces the smallest output. Simple strategy, but it works beautifully.

## The SIMD Detour (Because Why Not)

To figure out which algorithm to use, you first need to analyze what actually changed. Did someone add text in the middle? Delete a section? Completely rewrite it?

The key operation is finding the common prefix - how much of the beginning stayed the same.

```rust
fn analyze_change(old: &[u8], new: &[u8]) -> ChangeType {
    if new.len() > old.len() {
        // Might be an addition - find where they diverge
        let position = find_common_prefix(old, new);
        
        // Check if everything after the addition matches
        // If it does, we have a continuous insertion
        let added_len = new.len() - old.len();
        let expected_end = position + added_len;
        
        if expected_end <= new.len() {
            let old_suffix = &old[position..];
            let new_suffix = &new[expected_end..];
            
            if old_suffix == new_suffix {
                return ChangeType::ContinuousAdd {
                    position,
                    data: new[position..expected_end].to_vec(),
                };
            }
        }
    }
    
    // Similar logic for deletions...
    
    // Otherwise its complex
    ChangeType::Complex
}
```

So obviously I added AVX2 SIMD support:

```rust
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn find_common_prefix_avx2(a: &[u8], b: &[u8]) -> usize {
    use std::arch::x86_64::*;
    
    let len = a.len().min(b.len());
    let mut i = 0;
    
    // Process 32 bytes at a time with AVX2
    while i + 32 <= len {
        let a_vec = _mm256_loadu_si256(a.as_ptr().add(i) as *const __m256i);
        let b_vec = _mm256_loadu_si256(b.as_ptr().add(i) as *const __m256i);
        let cmp = _mm256_cmpeq_epi8(a_vec, b_vec);
        let mask = _mm256_movemask_epi8(cmp);
        
        if mask != -1 {
            return i + mask.trailing_ones() as usize;
        }
        i += 32;
    }
    
    // Handle remaining bytes
    while i < len && a[i] == b[i] {
        i += 1;
    }
    
    i
}
```

Does it make a difference? Yeah, actually. Comparing 32 bytes at once instead of one by one adds up when you're processing millions of deltas.

Is it overkill for most use cases? Probably. Did I do it anyway? Absolutely.

## The Tag System (This Is Where It Gets Wild)

Okay, so at this point xpatch is already pretty good. Specialized algorithms, automatic selection, SIMD optimization. It beats xdelta3 and gdelta on small edits.

But then I had another realization.

Watch this editing pattern:

1. **Version 1:** "hello"
2. **Version 2:** "hello world" (added text)
3. **Version 3:** "hello" (wait no, changed my mind, delete it)

Sequential diffing goes:

- v1 → v2: 9 bytes (add " world")
- v2 → v3: 3 bytes (remove 6 characters)
- **Total: 12 bytes**

But here's the thing: v3 is identical to v1. Like, exactly the same. Why are we encoding a diff at all? Why not just say "hey, this is the same as version 1"?

That's what the tag system does.

### How Tags Work

Every delta starts with a compact header:

```rust
fn encode_header(algo_type: Algorithm, tag: usize) -> Vec<u8> {
    let algo_type = algo_type as u8;
    
    if tag < 16 {
        // Fits in 4 bits alongside the algorithm - single byte total
        vec![(algo_type << 5) | (tag as u8)]
    } else {
        // Need more space - use variable-length encoding
        let first_bits = (tag & 0x0F) as u8;
        let mut bytes = Vec::new();
        bytes.push((algo_type << 5) | 0x10 | first_bits);
        
        // Encode the rest as a varint
        let mut remaining = tag >> 4;
        loop {
            let mut byte = (remaining & 0x7F) as u8;
            remaining >>= 7;
            if remaining != 0 {
                byte |= 0x80;  // Continuation bit
            }
            bytes.push(byte);
            if remaining == 0 { break; }
        }
        
        bytes
    }
}
```

The header is `[3 bits: algorithm][1 bit: flag][4 bits: tag or varint]`.

Tags 0-15 are **free** - they fit in the first byte alongside the algorithm identifier. The tag tells you which previous version was used as the base for this delta.

### The Magic Moment

Back to our editing example. Encoding v3 using v1 as the base (tag = 1):

```
Comparing v3 to v1:
- They're identical
- ChangeType: ContinuousAdd with position 0 and zero bytes
- Header: [Chars algorithm + tag 1] = 1 byte
- Data: [position varint: 0] = 1 byte
- Total: 2 bytes
```

That's it. Two bytes to represent "this version is the same as version 1." You see it uses tag 1, you grab version 1 as the base, apply the (empty) delta, and get the correct result.

This is why the median delta hits 2 bytes. When files revert to previous states - which happens way more often than you'd think - the delta is basically free.

### The Implementation Is Beautifully Dumb

When implementing this, you don't need to be smart about which version to reference. You just brute-forces it:

```rust
let mut best_delta = encode(0, previous_version, current_version, enable_zstd);

for tag in 1..MAX_TAG_DEPTH {
    if tag >= version_history.len() {
        break;
    }
    
    let base_version = version_history[current - tag];
    let candidate_delta = encode(tag, base_version, current_version, enable_zstd);
    
    if candidate_delta.len() < best_delta.len() {
        best_delta = candidate_delta;
    }
}
```

Try encoding against the last N versions (default: 16), pick whichever produces the smallest delta. That's the whole algorithm.

Checking 16 versions sounds expensive, but remember - encoding is microseconds. Even checking 16 times is still sub-millisecond. For document editing where you're capturing changes every 500ms, you could check the last 1000 versions and users wouldn't even notice.

## The Benchmarks (Where I Got Really Excited)

Alright, time for the numbers. And these aren't synthetic benchmarks or cherry-picked examples - this is real-world data from actual git repositories with all their messy, real-world chaos.

**Test corpus:**

- **tokio** (Rust async runtime): 1,805 files, 133,728 deltas
- **mdn/content** (MDN Web Docs): 28,914 files, 1,225,740 deltas
- **Total: 30,719 files, 1.2 million deltas**

Every single commit, every single file change. If it happened in the git history, it's in the benchmark.

My hardware: AMD Ryzen 7 7800X3D (16 threads), 64GB RAM, Fedora Linux. Nothing fancy, just a normal development machine.

### tokio Results (Code Repository)

|Algorithm|Median Delta|Compression Ratio|Space Saved|Median Encode|Median Decode|
|---|---|---|---|---|---|
|**xpatch_tags**|**2 bytes**|**0.0019**|**99.8%**|208 µs|0 µs|
|xpatch_sequential|68 bytes|0.0165|98.4%|14 µs|0 µs|
|vcdiff (xdelta3)|97 bytes|0.0276|97.2%|15 µs|3 µs|
|gdelta|69 bytes|0.0180|98.2%|1 µs|0 µs|

**Tag optimization impact: 88.7% smaller deltas** (median) compared to sequential mode.

Two. Fucking. Bytes. On a real code repository.

### mdn/content Results (Documentation Repository)

|Algorithm|Median Delta|Compression Ratio|Space Saved|Median Encode|Median Decode|
|---|---|---|---|---|---|
|**xpatch_tags**|**23 bytes**|**0.0063**|**99.4%**|104 µs|0 µs|
|xpatch_sequential|25 bytes|0.0069|99.3%|10 µs|0 µs|
|vcdiff (xdelta3)|50 bytes|0.0169|98.3%|9 µs|2 µs|
|gdelta|26 bytes|0.0077|99.2%|0 µs|0 µs|

**Tag optimization impact: 8.8% smaller deltas** (median) compared to sequential mode.

Still less than half the size of vcdiff, but the tag advantage is way smaller here.

### The Surprise That Made Me Think

I fully expected documentation to benefit more from tags. Documentation is iterative, right? You draft something, revise it, hate it, revert it, try again. Code is supposedly more linear - you write it, it works (or doesn't), you move on.

Turns out I was completely wrong.

**Code benefits 10x more from tags than documentation does.**

Looking deeper at the tag statistics:

- **tokio (code):** average tag 1.9, median 2 - jumping back ~2 commits on average
- **mdn/content (docs):** average tag 1.1, median 1 - mostly sequential

Code has way more rollbacks. Maybe it's test-driven development where you write tests, break things, revert. Maybe it's experimental features that get backed out. Maybe it's refactoring attempts that get abandoned. Whatever it is, code repositories have tons of "actually let's go back to how it was" moments.

I sure as hell didn't expect that.

The maximum beneficial jump I saw was around 10 commits back, though I only tested with a max depth of 16. For document editing where you're saving every 500ms, you could probably search back hundreds or thousands of versions and find even better matches.

### The Speed Numbers

For the mdn/content benchmark specifically, here's something wild:

- **Extracting versions from git:** 5 hours 26 minutes
- **Running all benchmarks:** 2 minutes 42 seconds (4 algorithms, serial processing)

Think about that. xpatch benched 1.2 million deltas in less time than it takes git to extract the files to disk.

The median encode times are 104-208 µs when trying 16 different encodings (tag mode). Sequential mode with just one encoding is 10-14 µs median. Decode is sub-microsecond regardless of algorithm.

These aren't "fast enough" numbers. This is "you'll never notice" performance.

### Where xpatch Loses

I'm not going to pretend this is perfect for everything. There are cases where xpatch doesn't win:

**Worst case:** Large structural rewrites, complete file replacements, binary data with no patterns.

For those scenarios, xpatch falls back to gdelta mode and performs roughly the same as vcdiff. Sometimes slightly better, sometimes slightly worse, generally competitive.

But that's fine. xpatch wasn't built for those cases. It was built for micro-edits and high-frequency version tracking.

For that use case, it dominates.

## Try It Yourself

**As a library:**
```bash
cargo add xpatch
```
```rust
use xpatch::delta;

let base = b"Hello, world!";
let new = b"Hello, beautiful world!";

// Encode
let delta = delta::encode(0, base, new, false);

// Decode
let restored = delta::decode(base, &delta).unwrap();
assert_eq!(restored, new);
```

**Or use the CLI:**
```bash
# Install
cargo install xpatch --features cli

# Create and apply deltas
xpatch encode old.txt new.txt -o patch.xdelta
xpatch decode old.txt patch.xdelta -o restored.txt
```

**Language Bindings:**

xpatch is also available for Python (`pip install xpatch-rs`), Node.js (`npm install xpatch-rs`), C/C++, and WebAssembly. Check the repository for installation and usage examples.

**Links:**
- Repository: https://github.com/ImGajeed76/xpatch
- Demo Editor: https://github.com/imgajeed76/xpatch_demo_editor
- Documentation: https://docs.rs/xpatch

## Was The Rabbit Hole Worth It?

Definitely.

I started three weeks ago with a simple frustration: "20 bytes is too much for adding 5 characters."

I built 7 specialized algorithms. Implemented SIMD optimizations. Created a custom tokenizer with 16,384 words. Designed a tag system that makes version history smaller instead of larger.

I tested it on 1.2 million real-world changes across 30,000 files.

**Result: median delta of 2 bytes.**

It works. It's fast. It's been tested to hell and back on real data.

And honestly? I'm kind of proud of this one.

The thing about going down rabbit holes is you never know what you'll find. Sometimes you waste a week on something that doesn't work. Sometimes you build something that solves a problem you didn't even know existed.

This was the second kind.

---

Star the repo if you think this problem was worth solving. Or if you just like seeing "median: 2 bytes" in benchmark tables.

I know I do.

*This article was also published on [dev.to](https://dev.to/imgajeed76/i-got-obsessed-with-2-byte-deltas-and-built-a-delta-compressor-that-actually-hits-them-4332).*

Oh wow, you really read through all of this! Thanks! Here's a cookie 🍪
