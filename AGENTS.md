# AGENTS — Agent Instructions for the Arika Extension

Purpose: provide concise, link-first guidance so AI coding agents can be immediately productive in this repository.

1) Quickstart (what agents need to run locally)
- Install dependencies: `npm install` — See [package.json](package.json).
- Compile: `npm run compile` — See [package.json](package.json).
- Watch (dev): `npm run watch` — See [package.json](package.json).
- Launch extension host: Press `F5` in VS Code (or use the Run panel). See [README.md](README.md).

2) High-value entry points (always reference these, don't duplicate their contents)
- Extension bootstrap: [src/extension.ts](src/extension.ts)
- Commands: [src/commands](src/commands)
- Core services: [src/services](src/services)
- Webview & templates: [src/providers](src/providers)

3) Key conventions & constraints (short, actionable)
- Keep changes minimal and targeted: prefer the smallest, semantically-correct patch that fixes the issue.
- Preserve public APIs and extension activation behavior; avoid renaming commands or changing `package.json` command IDs unless necessary.
- Never embed large documentation; link to existing docs (see [README.md](README.md)).
- Environment keys: the extension reads `.env` at the extension root. Valid keys: `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` (do not commit secrets).
- TypeScript: strict mode is enabled in [tsconfig.json](tsconfig.json). Keep types and fix compiler errors locally before proposing changes.

4) Testing & verification
- Compile locally with `npm run compile` and fix TypeScript errors. Use `npm run watch` for iterative changes.
- Prefer small, reproducible examples in the extension host when demonstrating behaviors (use `F5`).

5) Agent behavior rules (how the agent should act in this repo)
- Link, don't embed: reference existing files with links instead of copying content.
- Minimal edits: avoid broad refactors; provide incremental suggestions and tests.
- When proposing code, include exact file paths and small, self-contained diffs.
- If a change touches multiple files, explain the rationale and list the affected files.

6) Helpful references
- Project README: [README.md](README.md)
- Build scripts and scripts: [package.json](package.json)
- TypeScript config: [tsconfig.json](tsconfig.json)
- Main code: [src/extension.ts](src/extension.ts)

If you'd like, I can also add focused customization pages (examples: `AGENTS-frontend.md`, `AGENTS-tests.md`) to separate domain-specific guidance. Reply with which area to expand.
