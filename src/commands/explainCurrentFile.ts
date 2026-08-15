import * as vscode from 'vscode';
import { IAIService } from '../services/AIService';
import { IEditorContextService } from '../services/EditorContextService';
import { OpenChatCommand } from './openChat';
import { Logger } from '../utils/logger';

export class ExplainCurrentFileCommand {
    public static readonly commandId = 'arika.explainCurrentFile';

    public static register(
        context: vscode.ExtensionContext,
        aiService: IAIService,
        editorContextService: IEditorContextService
    ): vscode.Disposable {
        return vscode.commands.registerCommand(this.commandId, () => {
            this.execute(context, aiService, editorContextService);
        });
    }

    private static async execute(
        context: vscode.ExtensionContext,
        aiService: IAIService,
        editorContextService: IEditorContextService
    ): Promise<void> {
        Logger.info(`Executing command: ${this.commandId}`);

        const fileContext = editorContextService.getActiveFileContext();
        if (!fileContext || !fileContext.content.trim()) {
            vscode.window.showWarningMessage('Arika: Open a non-empty file in the editor to explain it.');
            return;
        }

        const structuredPrompt = `Please provide a comprehensive and structured explanation of the active file \`${fileContext.fileName}\` (${fileContext.languageId}):

### 1. Purpose
Explain the primary role, responsibilities, and goal of this file in the application.

### 2. Major Functions & Components
Identify and describe the key classes, methods, exports, and core execution logic.

### 3. Architecture & Design Patterns
Highlight any architectural principles, design patterns, dependencies, or SOLID practices utilized.

### 4. Potential Issues & Recommendations
Identify edge cases, code smells, performance bottlenecks, security vulnerabilities, or refactoring suggestions.`;

        await OpenChatCommand.openAndSendPrompt(context, aiService, structuredPrompt, fileContext);
    }
}
