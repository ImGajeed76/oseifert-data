---
title: "Axogen"
repoUrl: "https://github.com/axonotes/axogen"
liveUrl: "https://axonotes.github.io/axogen/"
role: "Creator"
technologies: [ "TypeScript", "Zod", "Node.js", "Nunjucks", "Handlebars", "Mustache" ]
status: "Active"
---

<!-- description -->
Axogen is a TypeScript-native configuration system that unifies typed environment variables, code generation, and task
management for any project in any language, prioritizing type safety and developer experience over the scattered .env
file chaos.
<!-- /description -->

<!-- content -->

# Axogen: Building a TypeScript-Native Config System Because .env Files Drive Me Crazy

## The Idea: What It Is and Why I Built It

Axogen is a configuration management tool that lets you define everything once in TypeScript and generate multiple
config formats automatically. You write your config in TypeScript with full type safety and Zod validation, and it spits
out .env files, JSON configs, YAML files, Docker configs, Kubernetes manifests - whatever you need. The key difference
from other tools: it validates everything before your app even starts, catching errors in milliseconds instead of
waiting for your app to crash 30 seconds into startup.

The whole thing started because I hit my absolute breaking point while working
on [AxonotesCore](https://github.com/axonotes/AxonotesCore). The project had grown into this nightmare of scattered
configuration files - hardcoded URLs buried in package.json scripts, different ports scattered across multiple .env
files, and the classic "change one thing, forget to update it in three other places" problem.

The moment I knew I had to build something was when I tried to show a new developer how to set up the project locally. I
watched them get confused, frustrated, and ultimately give up because our configuration was so scattered and
inconsistent. That's when I realized: configuration shouldn't be this hard, and definitely shouldn't be a barrier to
onboarding new people.

## The Journey: From Frustration to Solution

My first attempt was actually just trying to clean up AxonotesCore's existing setup manually. But I quickly realized the
problem was fundamental - we had the same information (ports, URLs, database connections) repeated across different
files in different formats, and there was no single source of truth.

I chose **TypeScript** as the foundation because developers already know it, and I wanted real type safety. The key was
integrating **Zod** for schema validation - not just string replacement, but actual validation that catches invalid
URLs, malformed base64, wrong number formats before anything gets generated.

The tech stack evolved to:

* **TypeScript + Zod:** For the config definition and validation
* **Template engines:** Nunjucks, Handlebars, Mustache support for complex config generation
* **Universal file support:** 10+ formats for both reading and generating configs
* **Command system:** Built-in task runner with nested commands and typed arguments

Here's what a real config looks like:

```typescript
const env = loadEnv(
    z.object({
        DATABASE_URL: z.url(),
        API_PORT: z.coerce.number().default(3001),
        WEB_PORT: z.coerce.number().default(3000),
        NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
    })
);

export default defineConfig({
    targets: {
        api: env({
            path: "api/.env",
            variables: {
                DATABASE_URL: env.DATABASE_URL,
                PORT: env.API_PORT,
            },
        }),
        web: env({
            path: "web/.env.local",
            variables: {
                NEXT_PUBLIC_API_URL: `http://localhost:${env.API_PORT}`,
            },
        }),
    },
});
```

Change `API_PORT` to 4000, run `axogen generate`, and every URL automatically updates. One source of truth, everything
else follows.

The workflow I ended up with works really well across my two development machines. Pull code, update `.env.axogen` with
my local secrets, run `axogen generate`, and everything just works. No hunting through files, no missing variables, no
debugging why services can't connect. When you run `axogen run dev`, it validates your config first - if something's
missing or wrong, you know immediately with a clear error message instead of waiting for your app to fail somewhere deep
in the startup process.

## Navigating Challenges: Hurdles and Solutions

The biggest challenge was **scope creep in the best way possible**. What started as a simple config generator kept
growing because each problem I solved revealed another one.

**Type Safety Evolution:** My initial API was pretty loose. I had to completely overhaul it to use dedicated functions
for each target type (`env()`, `json()`, `yaml()`) so TypeScript actually knows what you're doing and provides proper
IntelliSense.

**Secret Detection:** I realized people could accidentally push production API keys if Axogen generated them into
non-gitignored files. So I built automatic secret detection - if variables look like secrets (API keys, tokens, etc.)
and the target file isn't gitignored, Axogen refuses to generate. You can override with `unsafe()` but you have to
explicitly say WHY it's safe.

**Command System Complexity:** Simple string commands weren't enough. I ended up building a full nested command system
that supports everything from basic strings to complex command objects with help text, typed arguments, and custom
logic:

```typescript
commands: {
    "dev:api"
:
    `cd api && npm run dev --port ${env.API_PORT}`,
        deploy
:
    cmd({
        help: "Deploy the application",
        options: {
            environment: z.enum(["staging", "production"]).default("staging"),
        },
        exec: async (ctx) => {
            console.log(`🚀 Deploying to ${ctx.options.environment}...`);
        },
    }),
}
```

**Performance was surprisingly not a problem** - I didn't implement any optimizations, but it generates 10,000 config
files in about 2.2 seconds. Turns out when you're basically validating once and converting JSON to different formats,
things are naturally pretty fast.

## The Outcome: Where It Stands and What I Learned

Axogen is currently at v0.5.7 with 20 GitHub stars. It's functional and I've fully migrated AxonotesCore to use it, but
it's definitely still evolving. The core vision is achieved though - you can define configuration once in TypeScript and
generate any format you need with full type safety.

One important aspect: there's zero lock-in. The generated files are standard formats (.env, JSON, YAML) that work
without Axogen. Don't like it? Just delete it and keep using the files. No migration needed, no vendor lock-in, the
files are yours.

**Key things I learned:**

* **Developer experience really matters** - The console themes, colored output, and proper error messages aren't just
  pretty, they make the tool genuinely enjoyable to use
* **Type safety everywhere** - Using Zod for validation means no more silent failures. You get beautiful error messages
  that actually help you fix problems
* **Start simple, grow complex** - You can begin with basic configs and gradually add more sophisticated features as
  needed
* **Validation before execution** - Catching config errors in milliseconds before app startup is way more valuable than
  I initially thought

I'm most proud of the command system and the secret detection. Both solve real problems I've encountered, and they do it
in a way that feels natural to use.

**What's next:** Project initialization commands, better secrets management integration, and runtime loading
capabilities. The goal is becoming production-ready while keeping the developer experience that makes config management
actually fun.

The project successfully bridges the gap between dotenv's simplicity and enterprise complexity. It's TypeScript-native
but works for any project in any language - Python APIs, Go microservices, Docker configs, Kubernetes manifests, all
from one source of truth.

## Links:

* GitHub Repository: [https://github.com/axonotes/axogen](https://github.com/axonotes/axogen)
* Documentation: [https://axonotes.github.io/axogen/](https://axonotes.github.io/axogen/)
* NPM Package: [https://www.npmjs.com/package/@axonotes/axogen](https://www.npmjs.com/package/@axonotes/axogen)
* Discord: [https://discord.gg/myBMaaDeQu](https://discord.gg/myBMaaDeQu)

<!-- /content -->