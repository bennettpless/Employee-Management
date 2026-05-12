# Vibe Coding Bootstrapper

A project bootstrapper packed with Cursor rules and documentation from the **Vibe Coding** event hosted at **Bennett & Pless**. Clone this repo to jumpstart your next AI-assisted project with a proven, structured workflow out of the box.

---

## What's Inside

### Event Documentation (`docs/`)

Guides, slide decks, and reference material from the vibe coding session:

| Document | Description |
|----------|-------------|
| [AI Vibe Coding Event Deck](docs/event-docs/AI-Vibe-Coding-Event-deck.pdf) | Slide deck from the vibe coding event |
| [Cursor Dev Loop Deck](docs/event-docs/Cursor-Dev-Loop-deck.pdf) | Slide deck covering the Cursor Dev Loop workflow |
| [Cursor Dev Loop Description](docs/event-docs/Cursor-Dev-Loop-description.md) | Deep dive into the "Document-First" Cursor Dev Loop philosophy |
| [Cursor Dev Loop Description (PDF)](docs/event-docs/Cursor-Dev-Loop-description.pdf) | PDF version of the Dev Loop description |
| [Cursor Dev Loop Infographic](docs/event-docs/Cursor-Dev-Loop-info.png) | Visual overview of the Cursor Dev Loop |
| [Participant Setup Guide](docs/02-participant-setup-guide.md) | Step-by-step workstation setup (Cursor, Git, Node, cloud accounts) |
| [Dev Flow](docs/04-dev-flow.md) | End-to-end development workflow covering requirements, UI generation, source control, local dev, feature cycles, and deployment |

### Cursor Rules (`.cursor/rules/`)

Pre-configured `.mdc` rule files that guide Cursor's AI through a disciplined, four-step development workflow:

| Rule File | Purpose |
|-----------|---------|
| `prd-creation.mdc` | Generate a Product Requirements Document from prompts or reference docs |
| `implementation-plan.mdc` | Produce an architectural plan with phase breakdowns |
| `implementation-steps.mdc` | Decompose the plan into isolated, self-contained step files |
| `implement-step.mdc` | Execute a single step with verification gates |
| `tech-stack.mdc` | AI-native stack conventions (Next.js, Supabase, Shadcn/ui, TanStack Query, Zod) |
| `code-style.mdc` | Code style and naming conventions for Next.js App Router |
| `shadcn-ui.mdc` | Shadcn/ui component usage patterns |
| `github-workflow.mdc` | Commit message conventions and Git workflow |

---

## Getting Started

1. **Clone the repo**

```bash
git clone https://github.com/bennettpless/vibe_coding.git my-new-project
cd my-new-project
```

2. **Remove the git history** (start fresh)

```bash
rm -rf .git
git init
```

3. **Open in Cursor** and the rules will auto-activate as you work.

4. **Start building** -- kick off the four-step workflow:

```
"Create a PRD for [your feature description]"
```

---

## The Four-Step Workflow

The Cursor rules enforce a structured, document-first process:

```
1. PRD Creation        --> docs/[feature]/prd.md
2. Implementation Plan --> docs/[feature]/implementation-plan.md
3. Split into Steps    --> docs/[feature]/00-index.md + phase files
4. Implement Steps     --> Execute each phase, verify, commit
```

Each step externalizes project state into Markdown so the AI always has full context -- no more lost decisions or hallucinated code.

---

## Who Is This For

- Developers exploring AI-assisted "vibe coding" workflows
- Teams looking for a repeatable, document-first process with Cursor
- Anyone who attended the Bennett & Pless vibe coding event and wants to reuse the setup

---

## Learn More

- See `.cursor/rules/README.md` for detailed rule descriptions and the workflow diagram
- See `docs/04-dev-flow.md` for the full development lifecycle
- See `docs/event-docs/Cursor-Dev-Loop-description.md` for the philosophy behind the approach
