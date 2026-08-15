import * as vscode from 'vscode';
import * as path from 'path';
import { IAIService, CurrentFileContext } from '../services/AIService';
import { Logger } from '../utils/logger';

export class ExplainSelectionCommand {
    public static readonly commandId = 'arika.explainSelection';

    public static register(_context: vscode.ExtensionContext, aiService: IAIService): vscode.Disposable {
        return vscode.commands.registerCommand(this.commandId, () => {
            this.execute(aiService);
        });
    }

    private static async execute(aiService: IAIService): Promise<void> {
        Logger.info('Executing command: arika.explainSelection');

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Arika: No active editor found. Open a file to explain selected code.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();

        if (!selectedText) {
            vscode.window.showWarningMessage(
                'Arika: Please highlight a code snippet first to explain it!'
            );
            return;
        }

        const languageId = editor.document.languageId;
        const fileContext: CurrentFileContext = {
            fileName: path.basename(editor.document.fileName),
            languageId: editor.document.languageId,
            content: editor.document.getText(),
            filePath: editor.document.fileName
        };

        // Show quick feedback notification with progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Arika',
                cancellable: false
            },
            async (progress) => {
                progress.report({ message: 'Analyzing selected code snippet with AIService...' });

                // Delegate analysis to injected AIService instance with workspace file context
                const explanation = await aiService.explainCode(selectedText, languageId, undefined, fileContext);
                this.displayExplanation(selectedText, explanation, languageId);
            }
        );
    }

    private static displayExplanation(codeSnippet: string, explanation: string, languageId: string): void {
        Logger.show();
        Logger.info(`\n--- EXPLANATION FOR SELECTED CODE (${languageId}) ---\n${explanation}\n-----------------------------------------------\n`);

        vscode.window.showInformationMessage(
            `Arika: Explained ${languageId} snippet (${codeSnippet.length} chars). Details logged in Output Panel.`,
            'View Output'
        ).then((selection) => {
            if (selection === 'View Output') {
                Logger.show();
            }
        });
    }
}
