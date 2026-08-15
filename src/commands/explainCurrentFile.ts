import * as vscode from 'vscode';
import * as path from 'path';
import { IAIService, CurrentFileContext } from '../services/AIService';
import { OpenChatCommand } from './openChat';
import { Logger } from '../utils/logger';

export class ExplainCurrentFileCommand {
    public static readonly commandId = 'codetitan.explainCurrentFile';

    public static register(context: vscode.ExtensionContext, aiService: IAIService): vscode.Disposable {
        return vscode.commands.registerCommand(this.commandId, () => {
            this.execute(context, aiService);
        });
    }

    private static async execute(context: vscode.ExtensionContext, aiService: IAIService): Promise<void> {
        Logger.info(`Executing command: ${this.commandId}`);

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Arika: No active editor found. Open a file in the editor to explain it.');
            return;
        }

        const document = editor.document;
        const fileName = path.basename(document.fileName);
        const languageId = document.languageId;
        const content = document.getText();

        if (!content.trim()) {
            vscode.window.showWarningMessage(`Arika: The file "${fileName}" is empty. Nothing to explain.`);
            return;
        }

        const fileContext: CurrentFileContext = {
            fileName,
            languageId,
            content,
            filePath: document.fileName
        };

        const structuredPrompt = `Please provide a comprehensive and structured explanation of the active file \`${fileName}\` (${languageId}):

### 1. Purpose
Explain the primary role, responsibilities, and goal of this file in the application.

### 2. Major Functions & Components
Identify and describe the key classes, methods, exports, and core execution logic.

### 3. Architecture & Design Patterns
Highlight any architectural principles, design patterns, dependencies, or SOLID practices utilized.

### 4. Potential Issues & Recommendations
Identify edge cases, code smells, performance bottlenecks, security vulnerabilities, or refactoring suggestions.`;

        // Reveal Chat Panel and dispatch streaming query with active file context
        await OpenChatCommand.openAndSendPrompt(context, aiService, structuredPrompt, fileContext);
    }
}
