# Arika VS Code Extension

**Arika** is a production-grade VS Code extension written in TypeScript with clean architecture, providing AI-powered coding commands under the `arika` namespace.

---

## Features

- **Arika: Open Chat (`arika.openChat`)**
  - Opens a rich, interactive Webview Chat panel ("Arika Chat") built with responsive styling and real-time extension message passing.
- **Arika: Explain Selection (`arika.explainSelection`)**
  - Inspects active editor selection, highlights code insights, and logs analysis to the Arika Output Channel (`Arika`).
  - Keybinding shortcut: `Ctrl+Alt+E` / `Cmd+Alt+E`.
  - Accessible via Editor Context Menu (Right-click on selection).
- **Arika: Explain Current File (`arika.explainCurrentFile`)**
  - Analyzes the full active editor file (purpose, major functions, architecture, issues) in the Arika Chat Panel.

---

## Directory Structure

```
.
├── .vscode/
│   ├── launch.json       # Debug launch configurations for Extension Development Host
│   └── tasks.json        # Build and watch tasks
├── src/
│   ├── commands/
│   │   ├── openChat.ts            # Handler for arika.openChat command & Webview
│   │   ├── explainSelection.ts    # Handler for arika.explainSelection command
│   │   └── explainCurrentFile.ts  # Handler for arika.explainCurrentFile command
│   ├── errors/
│   │   └── ExtensionError.ts      # Domain error hierarchy
│   ├── providers/
│   │   ├── chatSidebarProvider.ts # Sidebar Webview provider
│   │   └── WebviewTemplateFactory.ts # Decoupled HTML/CSS template factory
│   ├── services/
│   │   ├── AIService.ts           # Google Gemini / OpenAI streaming AI provider
│   │   ├── ChatMemory.ts          # History storage, token budget & session persistence
│   │   ├── ContextBuilder.ts      # Token-budgeted prompt consolidation
│   │   ├── EditorContextService.ts# Active editor document queries
│   │   ├── RepoQAService.ts       # Repository-wide QA engine
│   │   ├── SearchService.ts       # Codebase symbol, filename & keyword search
│   │   └── WorkspaceScanner.ts    # Dirent-based workspace tree scanner
│   ├── utils/
│   │   └── logger.ts              # OutputChannel logging utility
│   └── extension.ts               # Main Extension Entry Point
├── package.json          # Extension Manifest & Command Registrations
├── tsconfig.json         # Strict TypeScript compiler options
├── .gitignore            # Git ignore rules
└── README.md             # Project documentation
```

---

## Setup & Running

### Prerequisites
- Node.js (v18+)
- Visual Studio Code (v1.90.0+)

### Setup Commands

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Compile TypeScript:**
   ```bash
   npm run compile
   ```

3. **Watch Mode (Auto-compile on change):**
   ```bash
   npm run watch
   ```

4. **Launch Extension in VS Code:**
   - Press `F5` in VS Code (or select **Run Extension** from the Debug tab).
   - A new Extension Development Host window will launch.
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type:
     - `Arika: Open Chat`
     - `Arika: Explain Selection`
     - `Arika: Explain Current File`
