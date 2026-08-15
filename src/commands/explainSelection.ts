import * as vscode from 'vscode';
import { IAIService } from '../services/AIService';
import { IEditorContextService } from '../services/EditorContextService';
import { OpenChatCommand } from './openChat';
import { Logger } from '../utils/logger';

export class ExplainSelectionCommand {
    public static readonly commandId = 'arika.explainSelection';

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
        Logger.info('Executing command: arika.explainSelection');

        const selectionData = editorContextService.getSelectedText();
        if (!selectionData) {
            vscode.window.showWarningMessage('Arika: Please highlight a code snippet first to explain it!');
            return;
        }

        const fileContext = editorContextService.getActiveFileContext();
        const prompt = `Please explain this selected ${selectionData.languageId} code snippet:\n\n\`\`\`${selectionData.languageId}\n${selectionData.text}\n\`\`\``;

        await OpenChatCommand.openAndSendPrompt(context, aiService, prompt, fileContext);
    }
}
