# Arika VS Code Extension

**Arika** is a production-grade VS Code extension written in TypeScript with clean architecture, providing AI-powered coding commands under the `codetitan` namespace.

---

## Features

- **Arika: Open Chat (`codetitan.openChat`)**
  - Opens a rich, interactive Webview Chat panel ("Arika CodeTitan Chat") built with responsive styling and real-time extension message passing.
- **Arika: Explain Selection (`codetitan.explainSelection`)**
  - Inspects active editor selection, highlights code insights, and logs analysis to the Arika Output Channel (`Arika CodeTitan`).
  - Keybinding shortcut: `Ctrl+Alt+E` / `Cmd+Alt+E`.
  - Accessible via Editor Context Menu (Right-click on selection).

---

## Directory Structure

```
.
├── .vscode/
│   ├── launch.json       # Debug launch configurations for Extension Development Host
│   └── tasks.json        # Build and watch tasks
├── src/
│   ├── commands/
│   │   ├── openChat.ts            # Handler for codetitan.openChat command & Webview
│   │   └── explainSelection.ts    # Handler for codetitan.explainSelection command
│   ├── utils/
│   │   └── logger.ts              # OutputChannel logging utility
│   └── extension.ts               # Main Extension Entry Point
├── package.json          # Extension Manifest & Command Registrations
├── tsconfig.json         # Strict TypeScript compiler options
├── .gitignore            # Git ignore rules
├── .vscodeignore        # Package bundler ignore rules
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
