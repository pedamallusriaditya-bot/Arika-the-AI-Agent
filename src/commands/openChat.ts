import * as vscode from 'vscode';
import * as path from 'path';
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
                localResourceRoots: [vscode.Uri.file(context.extensionPath)]
            }
        );

        OpenChatCommand.currentPanel = panel;
        panel.webview.html = this.getWebviewContent(panel.webview);

        panel.webview.onDidReceiveMessage(
            async (message: { command: string; text?: string }) => {
                switch (message.command) {
                    case 'sendMessage':
                        if (message.text) {
                            Logger.info(`[Panel Webview -> Command] User prompt: ${message.text}`);
                            await this.handleUserMessage(panel, message.text, aiService);
                        }
                        break;
                    case 'copyCode':
                        if (message.text) {
                            await vscode.env.clipboard.writeText(message.text);
                            vscode.window.showInformationMessage('Code copied to clipboard!');
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(
            () => {
                OpenChatCommand.currentPanel = undefined;
                Logger.info('Arika Chat Panel closed.');
            },
            null,
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
            fileName: path.basename(document.fileName),
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

    private static getWebviewContent(_webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Arika Chat</title>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background, #1e1e2e);
            --fg-color: var(--vscode-editor-foreground, #cdd6f4);
            --card-bg: rgba(255, 255, 255, 0.05);
            --accent-color: #89b4fa;
            --accent-hover: #b4befe;
            --user-bubble: #313244;
            --ai-bubble: #181825;
            --border-color: rgba(255, 255, 255, 0.1);
        }

        body {
            font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
            background-color: var(--bg-color);
            color: var(--fg-color);
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
        }

        header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--border-color);
            background: rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        h2 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--accent-color);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .badge {
            font-size: 0.7rem;
            background: rgba(137, 180, 250, 0.15);
            color: var(--accent-color);
            padding: 2px 8px;
            border-radius: 12px;
            border: 1px solid rgba(137, 180, 250, 0.3);
        }

        #chat-container {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            scroll-behavior: smooth;
        }

        .message {
            display: flex;
            flex-direction: column;
            max-width: 80%;
            animation: fadeIn 0.3s ease-in-out;
        }

        .message.user {
            align-self: flex-end;
        }

        .message.ai {
            align-self: flex-start;
        }

        .sender-name {
            font-size: 0.75rem;
            margin-bottom: 4px;
            color: var(--fg-color);
            opacity: 0.7;
        }

        .bubble {
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 0.9rem;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .message.user .bubble {
            background: var(--user-bubble);
            border-bottom-right-radius: 2px;
        }

        .message.ai .bubble {
            background: var(--ai-bubble);
            border: 1px solid var(--border-color);
            border-bottom-left-radius: 2px;
        }

        #input-container {
            padding: 16px 24px;
            background: rgba(0, 0, 0, 0.2);
            border-top: 1px solid var(--border-color);
            display: flex;
            gap: 12px;
        }

        textarea {
            flex: 1;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--fg-color);
            padding: 10px 14px;
            font-family: inherit;
            font-size: 0.9rem;
            resize: none;
            outline: none;
            min-height: 42px;
            max-height: 120px;
        }

        textarea:focus {
            border-color: var(--accent-color);
        }

        button {
            background: var(--accent-color);
            color: #11111b;
            border: none;
            border-radius: 8px;
            padding: 0 20px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }

        button:hover {
            background: var(--accent-hover);
        }

        .typing-dots {
            display: inline-flex;
            gap: 4px;
            align-items: center;
        }

        .dot {
            width: 4px;
            height: 4px;
            background: var(--accent-color);
            border-radius: 50%;
            animation: pulse 1.4s infinite ease-in-out;
        }

        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes pulse {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <header>
        <h2>⚡ Arika <span class="badge">v0.0.1</span></h2>
    </header>
    <div id="chat-container">
        <div class="message ai">
            <div class="sender-name">Arika</div>
            <div class="bubble">Welcome to Arika Panel! Type your coding question below.</div>
        </div>
    </div>
    <div id="input-container">
        <textarea id="prompt-input" placeholder="Ask Arika anything..." rows="1"></textarea>
        <button id="send-btn">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const promptInput = document.getElementById('prompt-input');
        const sendBtn = document.getElementById('send-btn');

        function appendMessage(sender, text, isUser) {
            const msgDiv = document.createElement('div');
            msgDiv.className = \`message \${isUser ? 'user' : 'ai'}\`;
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'sender-name';
            nameDiv.textContent = sender;

            const bubbleDiv = document.createElement('div');
            bubbleDiv.className = 'bubble';
            bubbleDiv.textContent = text;

            msgDiv.appendChild(nameDiv);
            msgDiv.appendChild(bubbleDiv);
            chatContainer.appendChild(msgDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            return bubbleDiv;
        }

        sendBtn.addEventListener('click', () => {
            const text = promptInput.value.trim();
            if (text) {
                appendMessage('You', text, true);
                vscode.postMessage({ command: 'sendMessage', text });
                promptInput.value = '';
                promptInput.style.height = 'auto';
            }
        });

        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });

        promptInput.addEventListener('input', () => {
            promptInput.style.height = 'auto';
            promptInput.style.height = promptInput.scrollHeight + 'px';
        });

        let currentStreamBubble = null;

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'appendUserMessage':
                    appendMessage('You', message.text, true);
                    break;
                case 'startStream':
                    currentStreamBubble = appendMessage(message.sender || 'Arika', '', false);
                    break;
                case 'streamChunk':
                    if (currentStreamBubble) {
                        currentStreamBubble.textContent += message.text;
                        scrollToBottom();
                    }
                    break;
                case 'endStream':
                    currentStreamBubble = null;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
