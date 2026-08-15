import * as vscode from 'vscode';
import * as path from 'path';
import { IAIService, CurrentFileContext } from '../services/AIService';
import { Logger } from '../utils/logger';

export class OpenChatCommand {
    public static readonly commandId = 'codetitan.openChat';
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
        Logger.info('Executing command: codetitan.openChat');

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (OpenChatCommand.currentPanel) {
            OpenChatCommand.currentPanel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'arikaChatPanel',
            'Arika CodeTitan Chat',
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
        panel.webview.postMessage({ command: 'startStream', sender: 'CodeTitan' });

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
            Logger.error('Error in OpenChatCommand handleUserMessage', error);
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
    <title>Arika CodeTitan Chat</title>
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
            padding: 16px 20px;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        header h2 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--accent-color);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .badge {
            background: linear-gradient(135deg, #89b4fa, #cba6f7);
            color: #11111b;
            font-size: 0.7rem;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 700;
            text-transform: uppercase;
        }

        #chat-container {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .message {
            display: flex;
            flex-direction: column;
            max-width: 85%;
            animation: fadeIn 0.3s ease-in-out;
        }

        .message.user {
            align-self: flex-end;
        }

        .message.ai {
            align-self: flex-start;
        }

        .bubble {
            padding: 12px 16px;
            border-radius: 12px;
            line-height: 1.5;
            font-size: 0.95rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .message.user .bubble {
            background-color: var(--user-bubble);
            border-bottom-right-radius: 2px;
            color: var(--fg-color);
        }

        .message.ai .bubble {
            background-color: var(--ai-bubble);
            border: 1px solid var(--border-color);
            border-bottom-left-radius: 2px;
        }

        .sender-name {
            font-size: 0.75rem;
            opacity: 0.7;
            margin-bottom: 4px;
            margin-left: 4px;
        }

        #input-container {
            padding: 16px 20px;
            background: rgba(0, 0, 0, 0.2);
            border-top: 1px solid var(--border-color);
            display: flex;
            gap: 12px;
        }

        textarea {
            flex: 1;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--fg-color);
            padding: 10px 14px;
            font-family: inherit;
            font-size: 0.95rem;
            resize: none;
            outline: none;
            transition: border-color 0.2s;
            height: 40px;
        }

        textarea:focus {
            border-color: var(--accent-color);
        }

        button {
            background: linear-gradient(135deg, #89b4fa, #b4befe);
            color: #11111b;
            border: none;
            border-radius: 8px;
            padding: 0 20px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s, transform 0.1s;
        }

        button:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        button:active {
            transform: translateY(0);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <header>
        <h2>⚡ Arika CodeTitan <span class="badge">v0.0.1</span></h2>
    </header>
    <div id="chat-container">
        <div class="message ai">
            <div class="sender-name">CodeTitan</div>
            <div class="bubble">Welcome to Arika CodeTitan Panel! Type your coding question below.</div>
        </div>
    </div>
    <div id="input-container">
        <textarea id="prompt-input" placeholder="Ask CodeTitan anything..." rows="1"></textarea>
        <button id="send-btn">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const promptInput = document.getElementById('prompt-input');
        const sendBtn = document.getElementById('send-btn');

        function appendMessage(sender, text, isUser) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + (isUser ? 'user' : 'ai');

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
        }

        function handleSend() {
            const text = promptInput.value.trim();
            if (!text) return;

            appendMessage('You', text, true);
            vscode.postMessage({ command: 'sendMessage', text: text });
            promptInput.value = '';
        }

        sendBtn.addEventListener('click', handleSend);
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        let currentStreamBubble = null;

        function scrollToBottom() {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'appendUserMessage':
                    appendMessage('You', message.text, true);
                    break;
                case 'receiveMessage':
                    appendMessage(message.sender, message.text, false);
                    break;
                case 'startStream':
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'message ai';
                    const nameDiv = document.createElement('div');
                    nameDiv.className = 'sender-name';
                    nameDiv.textContent = message.sender || 'CodeTitan';
                    currentStreamBubble = document.createElement('div');
                    currentStreamBubble.className = 'bubble';
                    msgDiv.appendChild(nameDiv);
                    msgDiv.appendChild(currentStreamBubble);
                    chatContainer.appendChild(msgDiv);
                    scrollToBottom();
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
