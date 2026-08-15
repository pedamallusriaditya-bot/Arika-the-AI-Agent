import * as vscode from 'vscode';
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
        panel.webview.html = this.getWebviewContent(panel.webview);

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
            --user-bubble: linear-gradient(135deg, #6c5ce7, #89b4fa);
            --ai-bubble: rgba(255, 255, 255, 0.04);
            --border-color: rgba(255, 255, 255, 0.12);
            --code-bg: #11111b;
            --bold-color: #f5e0dc;
            --inline-code-fg: #cba6f7;
            --inline-code-bg: rgba(203, 166, 247, 0.15);
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            background-color: var(--bg-color);
            color: var(--fg-color);
            margin: 0; padding: 0;
            display: flex; flex-direction: column;
            height: 100vh; overflow: hidden;
        }

        header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--border-color);
            background: rgba(0, 0, 0, 0.25);
            display: flex; align-items: center; justify-content: space-between;
        }

        h2 {
            margin: 0; font-size: 1.1rem; font-weight: 700;
            color: var(--accent-color); display: flex;
            align-items: center; gap: 8px; letter-spacing: 0.5px;
        }

        .badge {
            font-size: 0.7rem; background: rgba(137, 180, 250, 0.15);
            color: var(--accent-color); padding: 2px 8px;
            border-radius: 12px; border: 1px solid rgba(137, 180, 250, 0.3);
        }

        #chat-container {
            flex: 1; padding: 24px;
            overflow-y: auto; display: flex;
            flex-direction: column; gap: 18px;
            scroll-behavior: smooth;
        }

        .message {
            display: flex; flex-direction: column;
            max-width: 85%;
            animation: fadeIn 0.3s ease-in-out;
        }
        .message.user { align-self: flex-end; }
        .message.ai { align-self: flex-start; width: 100%; }

        .sender-name {
            font-size: 0.75rem; font-weight: 700;
            margin-bottom: 4px; color: var(--accent-color);
            opacity: 0.85; letter-spacing: 0.3px;
        }
        .message.user .sender-name { align-self: flex-end; color: var(--accent-hover); }

        .bubble {
            padding: 14px 18px; border-radius: 12px;
            font-size: 0.92rem; line-height: 1.6;
            word-break: break-word;
        }
        .message.user .bubble {
            background: var(--user-bubble); color: #ffffff;
            border-bottom-right-radius: 2px;
            box-shadow: 0 4px 12px rgba(108, 92, 231, 0.35);
            white-space: pre-wrap;
        }
        .message.ai .bubble {
            background: var(--ai-bubble);
            border: 1px solid var(--border-color);
            border-bottom-left-radius: 2px;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        }

        /* --- Rich Markdown Styling --- */
        .md-bold { color: var(--bold-color); font-weight: 700; }
        .md-italic { color: #cba6f7; font-style: italic; }
        
        .md-h2 {
            color: #89b4fa; font-size: 1.1rem; font-weight: 700;
            margin: 14px 0 8px 0; border-bottom: 1px solid rgba(137, 180, 250, 0.25);
            padding-bottom: 4px;
        }
        .md-h3 {
            color: #cba6f7; font-size: 1.02rem; font-weight: 700;
            margin: 12px 0 6px 0;
        }
        .md-h4 {
            color: #f9e2af; font-size: 0.95rem; font-weight: 700;
            margin: 10px 0 4px 0;
        }

        .inline-code {
            background: var(--inline-code-bg);
            color: var(--inline-code-fg);
            padding: 2px 6px; border-radius: 5px;
            font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
            font-size: 0.86em; border: 1px solid rgba(203, 166, 247, 0.3);
        }

        /* --- Code Card Block & Vivid Antigravity Syntax Colors --- */
        .code-card {
            background: var(--code-bg);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px; margin: 12px 0;
            overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        }
        .code-header {
            background: rgba(255, 255, 255, 0.06);
            padding: 6px 14px; display: flex;
            align-items: center; justify-content: space-between;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .code-lang {
            font-size: 0.75rem; font-weight: 700;
            color: #89b4fa; font-family: monospace; letter-spacing: 0.8px;
        }
        .copy-code-btn {
            background: rgba(255, 255, 255, 0.1);
            border: none; color: #cdd6f4;
            font-size: 0.74rem; padding: 4px 10px;
            border-radius: 4px; cursor: pointer; transition: all 0.2s;
        }
        .copy-code-btn:hover { background: var(--accent-color); color: #11111b; font-weight: 700; }
        .code-pre {
            margin: 0; padding: 14px;
            overflow-x: auto; font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
            font-size: 0.86rem; line-height: 1.5; color: #cdd6f4;
        }

        /* Syntax Highlight Tokens */
        .syn-keyword { color: #f38ba8; font-weight: 700; }  /* Pink/Red Control Flow */
        .syn-type { color: #f9e2af; font-weight: 600; }     /* Gold Types/Structs */
        .syn-func { color: #89b4fa; font-weight: 600; }     /* Sapphire Functions */
        .syn-string { color: #a6e3a1; }                    /* Emerald Strings */
        .syn-number { color: #fab387; }                    /* Peach Numbers */
        .syn-comment { color: #6c7086; font-style: italic; }/* Slate Grey Comments */
        .syn-operator { color: #89dceb; font-weight: 700; } /* Sky Blue Operators */

        .md-li { margin-left: 18px; list-style-type: disc; margin-bottom: 4px; }
        .badge-alert {
            padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;
            display: inline-block; margin: 2px 0;
        }
        .alert-warning { background: rgba(243, 139, 168, 0.2); color: #f38ba8; border: 1px solid #f38ba8; }
        .alert-info { background: rgba(137, 180, 250, 0.2); color: #89b4fa; border: 1px solid #89b4fa; }

        #input-container {
            padding: 16px 24px;
            background: rgba(0, 0, 0, 0.25);
            border-top: 1px solid var(--border-color);
            display: flex; gap: 12px;
        }

        textarea {
            flex: 1; background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            border-radius: 8px; color: var(--fg-color);
            padding: 10px 14px; font-family: inherit; font-size: 0.9rem;
            resize: none; outline: none; min-height: 42px; max-height: 120px;
        }
        textarea:focus { border-color: var(--accent-color); }

        button {
            background: linear-gradient(135deg, #89b4fa, #cba6f7);
            color: #11111b; border: none; border-radius: 8px;
            padding: 0 22px; font-weight: 700; cursor: pointer;
            transition: opacity 0.2s, transform 0.1s;
        }
        button:hover { opacity: 0.9; transform: translateY(-1px); }

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
            <div class="bubble">Welcome to <strong>Arika Panel</strong>! Type your coding question below.</div>
        </div>
    </div>
    <div id="input-container">
        <textarea id="prompt-input" placeholder="Ask Arika anything..." rows="1"></textarea>
        <button id="send-btn" type="button">Send</button>
    </div>

    <script>
        function escapeHtml(str) {
            return (str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function copyCodeText(btn) {
            const codeCard = btn.closest('.code-card');
            const codePre = codeCard.querySelector('code');
            if (codePre) {
                navigator.clipboard.writeText(codePre.innerText);
                const origText = btn.innerText;
                btn.innerText = 'Copied!';
                setTimeout(function() { btn.innerText = origText; }, 1500);
            }
        }

        function colorizeCode(code) {
            let c = code
                .replace(/≠/g, '!=')
                .replace(/→/g, '->')
                .replace(/≤/g, '<=')
                .replace(/≥/g, '>=');

            let safe = escapeHtml(c);

            const comments = [];
            safe = safe.replace(/(\\/\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)/g, function(m) {
                const i = comments.length;
                comments.push('<span class="syn-comment">' + m + '</span>');
                return '___COMMENT_' + i + '___';
            });

            const strings = [];
            safe = safe.replace(/("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*')/g, function(m) {
                const i = strings.length;
                strings.push('<span class="syn-string">' + m + '</span>');
                return '___STRING_' + i + '___';
            });

            const keywords = /\\b(void|int|char|float|double|long|short|unsigned|signed|struct|enum|union|typedef|if|else|while|for|do|return|break|continue|switch|case|default|const|static|volatile|extern|inline|public|private|protected|class|template|typename|using|namespace|new|delete|try|catch|throw|auto|async|await|function|let|var|import|export|from)\\b/g;
            safe = safe.replace(keywords, '<span class="syn-keyword">$1</span>');

            safe = safe.replace(/\\b(Node|NULL|RED|BLACK|true|false|TRUE|FALSE|nullptr|std|size_t)\\b/g, '<span class="syn-type">$1</span>');

            safe = safe.replace(/(-&gt;|!=|==|=&gt;)/g, '<span class="syn-operator">$1</span>');

            safe = safe.replace(/\\b([a-zA-Z_]\\w*)(?=\\s*\\()/g, '<span class="syn-func">$1</span>');

            safe = safe.replace(/\\b(\\d+(\\.\\d+)?)\\b/g, '<span class="syn-number">$1</span>');

            strings.forEach(function(s, i) { safe = safe.split('___STRING_' + i + '___').join(s); });
            comments.forEach(function(cm, i) { safe = safe.split('___COMMENT_' + i + '___').join(cm); });

            return safe;
        }

        function renderRichMarkdown(text) {
            if (!text) return '';

            const codeBlocks = [];
            var t3 = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
            var codeBlockRegex = new RegExp(t3 + '([a-zA-Z0-9_+-]*)[\\\\r\\\\n]+([\\\\s\\\\S]*?)(?:' + t3 + '|$)', 'g');

            let html = text.replace(codeBlockRegex, function(match, lang, code) {
                const idx = codeBlocks.length;
                const language = (lang || 'code').toUpperCase();
                const colorizedCode = colorizeCode(code.trim());
                codeBlocks.push(
                    '<div class="code-card">' +
                        '<div class="code-header">' +
                            '<span class="code-lang">' + language + '</span>' +
                            '<button class="copy-code-btn" type="button" onclick="copyCodeText(this)">Copy Code</button>' +
                        '</div>' +
                        '<pre class="code-pre"><code>' + colorizedCode + '</code></pre>' +
                    '</div>'
                );
                return '%%%CODEBLOCK_' + idx + '%%%';
            });

            var t1 = String.fromCharCode(96);
            var inlineCodeRegex = new RegExp(t1 + '([^' + t1 + ']+)' + t1, 'g');
            html = html.replace(inlineCodeRegex, function(m, code) {
                return '<code class="inline-code">' + colorizeCode(code) + '</code>';
            });

            html = html.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
            html = html.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
            html = html.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');

            html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="md-bold">$1</strong>');
            html = html.replace(/__(.*?)__/g, '<strong class="md-bold">$1</strong>');

            html = html.replace(/\\*(.*?)\\*/g, '<em class="md-italic">$1</em>');

            html = html.replace(/\\[(IMPORTANT|WARNING|CAUTION)\\]/gi, '<span class="badge-alert alert-warning">$1</span>');
            html = html.replace(/\\[(NOTE|TIP|INFO)\\]/gi, '<span class="badge-alert alert-info">$1</span>');

            html = html.replace(/^\\s*[-*]\\s+(.*$)/gim, '<div class="md-li">$1</div>');

            html = html.replace(/\\n\\n/g, '<br/><br/>');
            html = html.replace(/\\n/g, '<br/>');

            codeBlocks.forEach(function(block, i) {
                const placeholder = '%%%CODEBLOCK_' + i + '%%%';
                html = html.split(placeholder).join(block);
            });

            return html;
        }

        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const promptInput = document.getElementById('prompt-input');
        const sendBtn = document.getElementById('send-btn');

        function appendMessage(sender, rawText, isUser) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + (isUser ? 'user' : 'ai');
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'sender-name';
            nameDiv.textContent = sender;

            const bubbleDiv = document.createElement('div');
            bubbleDiv.className = 'bubble';
            if (isUser) {
                bubbleDiv.textContent = rawText;
            } else {
                bubbleDiv.innerHTML = renderRichMarkdown(rawText);
            }

            msgDiv.appendChild(nameDiv);
            msgDiv.appendChild(bubbleDiv);
            chatContainer.appendChild(msgDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            return bubbleDiv;
        }

        function handleSend() {
            const text = promptInput.value.trim();
            if (!text) return;
            appendMessage('You', text, true);
            vscode.postMessage({ command: 'sendMessage', text: text });
            promptInput.value = '';
            promptInput.style.height = '42px';
            promptInput.focus();
        }

        sendBtn.addEventListener('click', function(e) {
            if (e) e.preventDefault();
            handleSend();
        });

        promptInput.addEventListener('keydown', function(e) {
            if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSend();
                return false;
            }
        });

        promptInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        let currentStreamBubble = null;
        let currentStreamRawText = '';

        window.addEventListener('message', function(event) {
            const message = event.data;
            switch (message.command) {
                case 'appendUserMessage':
                    appendMessage('You', message.text, true);
                    break;
                case 'startStream':
                    currentStreamRawText = '';
                    currentStreamBubble = appendMessage(message.sender || 'Arika', '', false);
                    break;
                case 'streamChunk':
                    if (currentStreamBubble) {
                        currentStreamRawText += message.text;
                        currentStreamBubble.innerHTML = renderRichMarkdown(currentStreamRawText);
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                    break;
                case 'endStream':
                    currentStreamBubble = null;
                    currentStreamRawText = '';
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
