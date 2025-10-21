---
title: "Syrup"
repoUrl: "https://github.com/Abdallah-Alwarawreh/Syrup"
liveUrl: "https://joinsyrup.com/"
role: "Maintainer"
technologies: [ "Go", "PostgreSQL", "Redis", "JavaScript" ]
status: "Active"
writtenAt: "2025-10-21T00:00:00.000Z"
updatedAt: "2025-10-21T00:00:00.000Z"
---

<!-- description -->
Syrup is a lightweight, open-source browser extension designed to make finding and applying the best coupons effortless,
prioritizing transparency, user privacy, and ethical design over the profit-driven motives seen in many alternatives.


<!-- /description -->

<!-- content -->

# Syrup: Building an Open-Source, Ethical Alternative to Honey

## The Idea: What It Is and Why I Built It

Syrup is a browser extension that automatically finds and applies coupons while you shop online. The core idea was
sparked by discussions around the popular extension Honey, particularly Hexium's YouTube video "Honey is a SCAM... so I
made my own" and the original "Exposing the Honey Influencer Scam" video. These highlighted concerns about data privacy,
transparency, and the business models of existing coupon tools. Funny enough, I'd been thinking about a similar concept
myself just days before seeing Hexium's video.

The main problem Syrup addresses is the lack of a truly open-source, community-driven, and privacy-respecting coupon
finder. Existing tools often feel like black boxes, potentially collecting more data than necessary or prioritizing
certain retailers for profit. My motivation was to contribute to building a better alternative – one that puts users
first. Hexium's initial version was a proof-of-concept, and seeing the need for a robust backend, I offered to build it.
While others initially showed interest, my motivation kept me going, and I dove into creating the API. This project is
for anyone who wants an effective coupon tool they can trust and potentially even contribute to.

## The Journey: From Concept to Reality

My first step was focusing on the backend API, aiming for something reliable and efficient. I decided on the following
tech stack:

* **Go (Golang):** I chose Go because I wanted something fast and efficient. Its ability to compile into a single binary
  makes deployment incredibly simple, which is great for an open-source project. Plus, I was eager to learn it, and it
  turned out to be a fantastic language for building web APIs – surprisingly straightforward.
* **PostgreSQL:** A powerful and reliable open-source relational database, perfect for storing structured data about
  coupons, stores, and user feedback (like ratings).
* **Redis:** Selected specifically to tackle performance issues. Caching frequently accessed data or computed results (
  like coupon scores) in Redis significantly speeds up responses.

With these tools, I built the [DiscountDB-API](https://github.com/ImGajeed76/discountdb-api), an open-source backend to
manage coupon data. I also created a simple frontend, [DiscountDB](https://discountdb.ch/), to interact with it. Seeing
my commitment and the functional backend, Hexium added me as a maintainer for the main Syrup browser extension project,
which now uses the DiscountDB-API.

The project continues to evolve. We are currently planning and discussing
a [new V2 API standard](https://github.com/Abdallah-Alwarawreh/Syrup/pull/120). The goal here is decentralization and
flexibility. We want users to be able to host their own backend instances or even develop entirely new backends
conforming to the standard, simply by changing the API URL in the extension settings. This supports the vision of a
truly public, free, and anonymous coupon database ecosystem.

## Navigating Challenges: Hurdles and Solutions

The biggest initial hurdle was **performance**. Calculating the best coupon involved potentially complex scoring and
filtering logic across many coupons. Early versions of the API could take up to 4 seconds for some requests, which is
far too slow for a good user experience.

* **Solution:** Implementing Redis caching was key. By storing recent search results and pre-calculated scores, we
  drastically reduced response times, often down to around 200ms.
* **Future Exploration:** I've also looked into technologies like SpacetimeDB. While primarily designed for real-time
  multiplayer games, its architecture might offer interesting possibilities for efficiently handling computations like
  coupon scoring in the future. It's an idea I'm keeping in mind.

Another significant challenge is **coupon management**. Currently, adding new coupons and managing existing ones
effectively within the database is difficult.

* **Solution:** This is a core focus of the upcoming V2 API design. We're building the new standard with robust coupon
  submission, verification, and management features in mind.

On a personal level, tackling this project meant **learning Go from scratch**. While a challenge initially, it was
incredibly rewarding. I quickly grew to appreciate the language's simplicity, performance, and tooling, which made
building the API an enjoyable process.

## The Outcome: Where It Stands and What I Learned

Syrup and its backend (DiscountDB-API) are functional and actively used, but development is ongoing. As an open-source
project maintained by volunteers (like me, Hexium, and others) in our free time, progress can sometimes be slow, but
it's steady.

We haven't fully realized the V2 vision yet, but the current version successfully provides an ethical, open-source
alternative, achieving the core initial goal.

Key Learnings:

* **Technical Skills:** Gained significant experience in Go, API design (RESTful principles), database management (
  PostgreSQL), and performance optimization using caching (Redis).
* **Open Source:** Learned about collaborating on a public project, managing contributions (even if small-scale
  currently), and the importance of clear standards (like the V2 API plan).
* **Problem Solving:** Tackling the performance issues required research and understanding trade-offs between different
  caching strategies.

I'm most proud of successfully learning Go through this project and becoming a maintainer alongside Hexium, contributing
meaningfully to a project I believe in.

Potential next steps include finalizing and implementing the V2 API standard, building better tools for coupon
management, and continuing to grow the Syrup user and contributor community.

## Links:

* Syrup Website: [https://joinsyrup.com/](https://joinsyrup.com/)
* Syrup Extension
  Repository: [https://github.com/Abdallah-Alwarawreh/Syrup](https://github.com/Abdallah-Alwarawreh/Syrup)
* DiscountDB API
  Repository: [https://github.com/ImGajeed76/discountdb-api](https://github.com/ImGajeed76/discountdb-api)

<!-- /content -->