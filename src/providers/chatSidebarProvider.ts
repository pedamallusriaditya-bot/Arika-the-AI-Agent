import * as vscode from 'vscode';
import * as path from 'path';
import { IAIService, CurrentFileContext } from '../services/AIService';
import { IRepoQAService } from '../services/RepoQAService';
import { IChatMemory } from '../services/ChatMemory';
import { WebviewTemplateFactory } from './WebviewTemplateFactory';
import { Logger } from '../utils/logger';

export class ChatSidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codetitan.sidebarView';
    private _view?: vscode.WebviewView;
    private _activeCancellationTokenSource?: vscode.CancellationTokenSource;

    /**
     * Injects extension URI, IAIService, optional IRepoQAService, and optional IChatMemory.
     */
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _aiService: IAIService,
        private readonly _repoQAService?: IRepoQAService,
        private readonly _chatMemory?: IChatMemory
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = WebviewTemplateFactory.getSidebarHtml('CodeTitan');

        // Restore persisted conversation history upon webview resolution
        if (this._chatMemory) {
            const history = this._chatMemory.getMessages();
            for (const msg of history) {
                if (msg.role !== 'system') {
                    webviewView.webview.postMessage({
                        command: 'receiveMessage',
                        sender: msg.role === 'user' ? 'You' : 'CodeTitan',
                        text: msg.content
                    });
                }
            }
        }

        // Listen for postMessage dispatches from Webview
        webviewView.webview.onDidReceiveMessage(async (message: { command: string; text?: string }) => {
            switch (message.command) {
                case 'sendMessage':
                    if (message.text) {
                        Logger.info(`[Sidebar Webview -> Provider] User prompt: ${message.text}`);
                        await this._handleUserMessage(message.text);
                    }
                    break;
                case 'cancelRequest':
                    if (this._activeCancellationTokenSource) {
                        Logger.info('[Sidebar] User triggered generation cancellation.');
                        this._activeCancellationTokenSource.cancel();
                    }
                    break;
                case 'clearHistory':
                    Logger.info('[Sidebar] Chat history cleared');
                    if (this._chatMemory) {
                        await this._chatMemory.clearHistory();
                    }
                    vscode.window.showInformationMessage('CodeTitan: Chat history cleared.');
                    break;
                case 'copyText':
                    if (message.text) {
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('CodeTitan: Copied to clipboard!');
                    }
                    break;
            }
        });
    }

    /**
     * Extracts active editor details into CurrentFileContext.
     */
    private _getActiveFileContext(): CurrentFileContext | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const document = editor.document;
        return {
            fileName: path.basename(document.fileName),
            languageId: document.languageId,
            content: document.getText(),
            filePath: document.fileName
        };
    }

    private async _handleUserMessage(userMessage: string): Promise<void> {
        if (!this._view) {
            return;
        }

        // Record user turn in chat memory
        if (this._chatMemory) {
            await this._chatMemory.addMessage('user', userMessage);
        }

        // Initialize cancellation token for this request
        this._activeCancellationTokenSource = new vscode.CancellationTokenSource();
        const cancelToken = this._activeCancellationTokenSource.token;

        // Show typing indicator in UI
        this._view.webview.postMessage({ command: 'setLoading', loading: true });
        this._view.webview.postMessage({ command: 'startStream', sender: 'CodeTitan' });

        const fileContext = this._getActiveFileContext();
        if (fileContext) {
            Logger.info(`[Sidebar] Context extracted for active file: ${fileContext.fileName} (${fileContext.languageId})`);
        }

        let fullAiResponse = '';
        const onChunkCallback = (chunk: string) => {
            fullAiResponse += chunk;
            this._view?.webview.postMessage({
                command: 'streamChunk',
                text: chunk
            });
        };

        try {
            if (this._repoQAService) {
                // Delegate to RepoQAService for search-backed repository QA with cancellation support
                await this._repoQAService.askRepo(userMessage, onChunkCallback, fileContext, cancelToken);
            } else {
                // Delegate prompt processing to injected AIService with real-time streaming & cancellation support
                await this._aiService.askStream(userMessage, onChunkCallback, fileContext, cancelToken);
            }

            // Record assistant response in chat memory
            if (this._chatMemory && fullAiResponse) {
                await this._chatMemory.addMessage('assistant', fullAiResponse);
            }
        } catch (error) {
            Logger.error('Error handling sidebar message in AIService', error);
            this._view.webview.postMessage({
                command: 'streamChunk',
                text: '\n⚠️ An error occurred while processing your request.'
            });
        } finally {
            this._activeCancellationTokenSource.dispose();
            this._activeCancellationTokenSource = undefined;
            this._view.webview.postMessage({ command: 'endStream' });
            this._view.webview.postMessage({ command: 'setLoading', loading: false });
        }
    }
}
