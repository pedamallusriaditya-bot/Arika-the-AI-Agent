import * as vscode from 'vscode';
import { WebviewTemplateFactory } from '../providers/WebviewTemplateFactory';
import { IAIService, CurrentFileContext } from '../services/AIService';
import { Logger } from '../utils/logger';

export class OpenChatCommand {
    public static readonly commandId = 'arika.openChat';
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static register(context: vscode.ExtensionContext, aiService: IAIService): vscode.Disposable {
        return vscode.commands.registerCommand(this.commandId, () => {
            this.execute(context, aiService);
        });
    }

    /**
     * Opens the chat panel and automatically dispatches a prompt with optional file context.
     */
    public static async openAndSendPrompt(
        context: vscode.ExtensionContext,
        aiService: IAIService,
        prompt: string,
        fileContext?: CurrentFileContext
    ): Promise<void> {
        this.execute(context, aiService);
        if (this.currentPanel) {
            this.currentPanel.webview.postMessage({
                command: 'appendUserMessage',
                text: prompt
            });
            await this.handleUserMessage(this.currentPanel, prompt, aiService, fileContext);
        }
    }

    private static execute(context: vscode.ExtensionContext, aiService: IAIService): void {
        Logger.info('Executing command: arika.openChat');

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (OpenChatCommand.currentPanel) {
            OpenChatCommand.currentPanel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'arikaChatPanel',
            'Arika Chat',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        OpenChatCommand.currentPanel = panel;
        panel.webview.html = WebviewTemplateFactory.getPanelHtml('Arika Chat Panel');

        panel.onDidDispose(
            () => {
                Logger.info('Arika Chat webview panel disposed.');
                OpenChatCommand.currentPanel = undefined;
            },
            null,
            context.subscriptions
        );

        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendMessage':
                        if (message.text) {
                            Logger.info(`[Panel Webview -> Extension] User prompt: ${message.text}`);
                            await this.handleUserMessage(panel, message.text, aiService);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    }

    private static getActiveFileContext(): CurrentFileContext | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const document = editor.document;
        return {
            fileName: document.fileName.split(/[\\/]/).pop() || 'Untitled',
            languageId: document.languageId,
            content: document.getText(),
            filePath: document.fileName
        };
    }

    private static async handleUserMessage(
        panel: vscode.WebviewPanel,
        userMessage: string,
        aiService: IAIService,
        overrideFileContext?: CurrentFileContext
    ): Promise<void> {
        panel.webview.postMessage({ command: 'setLoading', loading: true });
        panel.webview.postMessage({ command: 'startStream', sender: 'Arika' });

        const fileContext = overrideFileContext || this.getActiveFileContext();
        if (fileContext) {
            Logger.info(`[Panel] Active file context attached: ${fileContext.fileName} (${fileContext.languageId})`);
        }

        try {
            await aiService.askStream(userMessage, (chunk: string) => {
                panel.webview.postMessage({
                    command: 'streamChunk',
                    text: chunk
                });
            }, fileContext);
        } catch (error) {
            Logger.error('Error handling webview chat message', error);
            panel.webview.postMessage({
                command: 'streamChunk',
                text: '\n⚠️ An error occurred while processing your request.'
            });
        } finally {
            panel.webview.postMessage({ command: 'endStream' });
            panel.webview.postMessage({ command: 'setLoading', loading: false });
        }
    }
}
