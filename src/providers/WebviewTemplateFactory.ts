/**
 * Decoupled HTML/CSS/JS template generator factory for Arika webviews.
 */
export class WebviewTemplateFactory {
    /**
     * Generates Sidebar Webview HTML content with rich Markdown & Code Block rendering.
     */
    public static getSidebarHtml(title: string = 'Arika'): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        :root {
            --bg-color: var(--vscode-sideBar-background, #1e1e2e);
            --fg-color: var(--vscode-sideBar-foreground, #cdd6f4);
            --border-color: var(--vscode-sideBar-border, rgba(255, 255, 255, 0.12));
            --input-bg: var(--vscode-input-background, #181825);
            --input-fg: var(--vscode-input-foreground, #cdd6f4);
            --input-border: var(--vscode-input-border, rgba(255, 255, 255, 0.15));
            --user-msg-bg: linear-gradient(135deg, #6c5ce7, #89b4fa);
            --user-msg-fg: #ffffff;
            --assistant-msg-bg: rgba(255, 255, 255, 0.04);
            --assistant-msg-border: rgba(137, 180, 250, 0.25);
            --accent-color: #89b4fa;
            --accent-hover: #b4befe;
            --code-bg: #11111b;
            --bold-color: #f5e0dc;
            --inline-code-fg: #cba6f7;
            --inline-code-bg: rgba(203, 166, 247, 0.15);
        }

        * { box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            background-color: var(--bg-color);
            color: var(--fg-color);
            margin: 0; padding: 0;
            display: flex; flex-direction: column;
            height: 100vh; overflow: hidden;
        }

        /* Header Bar */
        .header {
            padding: 12px 14px;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid var(--border-color);
            display: flex; align-items: center; justify-content: space-between;
        }

        .header-title {
            display: flex; align-items: center; gap: 8px;
            font-weight: 700; font-size: 0.95rem;
            color: var(--accent-color); letter-spacing: 0.5px;
        }

        .status-dot {
            width: 8px; height: 8px;
            background-color: #a6e3a1; border-radius: 50%;
            box-shadow: 0 0 8px #a6e3a1;
        }

        .clear-btn {
            background: transparent; border: none;
            color: var(--fg-color); opacity: 0.6;
            cursor: pointer; font-size: 0.75rem;
            padding: 2px 6px; border-radius: 4px;
            transition: all 0.2s;
        }
        .clear-btn:hover { opacity: 1; background: rgba(255, 255, 255, 0.1); }

        /* Chat Scroll Area */
        #chat-messages {
            flex: 1; padding: 12px;
            overflow-y: auto; display: flex;
            flex-direction: column; gap: 14px;
            scroll-behavior: smooth;
        }

        .message-row {
            display: flex; flex-direction: column;
            max-width: 92%;
            animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .message-row.user { align-self: flex-end; }
        .message-row.assistant { align-self: flex-start; width: 100%; }

        .sender-tag {
            font-size: 0.72rem; font-weight: 700;
            margin-bottom: 4px; opacity: 0.85; padding-left: 2px;
            letter-spacing: 0.3px;
        }
        .message-row.user .sender-tag { align-self: flex-end; color: var(--accent-hover); }
        .message-row.assistant .sender-tag { align-self: flex-start; color: var(--accent-color); }

        .bubble {
            padding: 12px 14px; border-radius: 12px;
            font-size: 0.88rem; line-height: 1.6;
            word-wrap: break-word;
        }
        .message-row.user .bubble {
            background: var(--user-msg-bg); color: var(--user-msg-fg);
            border-bottom-right-radius: 2px;
            box-shadow: 0 3px 10px rgba(108, 92, 231, 0.35);
            white-space: pre-wrap;
        }
        .message-row.assistant .bubble {
            background-color: var(--assistant-msg-bg);
            border: 1px solid var(--assistant-msg-border);
            border-bottom-left-radius: 2px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }

        /* --- Rich Markdown Styling --- */
        .md-bold { color: var(--bold-color); font-weight: 700; }
        .md-italic { color: #cba6f7; font-style: italic; }
        
        .md-h2 {
            color: #89b4fa; font-size: 1.05rem; font-weight: 700;
            margin: 12px 0 6px 0; border-bottom: 1px solid rgba(137, 180, 250, 0.25);
            padding-bottom: 4px;
        }
        .md-h3 {
            color: #cba6f7; font-size: 0.98rem; font-weight: 700;
            margin: 10px 0 4px 0;
        }
        .md-h4 {
            color: #f9e2af; font-size: 0.9rem; font-weight: 700;
            margin: 8px 0 4px 0;
        }

        .inline-code {
            background: var(--inline-code-bg);
            color: var(--inline-code-fg);
            padding: 2px 6px; border-radius: 5px;
            font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
            font-size: 0.84em; border: 1px solid rgba(203, 166, 247, 0.3);
        }

        /* --- Code Card Block & Vivid Antigravity Syntax Colors --- */
        .code-card {
            background: var(--code-bg);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px; margin: 10px 0;
            overflow: hidden;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
        }
        .code-header {
            background: rgba(255, 255, 255, 0.06);
            padding: 6px 12px; display: flex;
            align-items: center; justify-content: space-between;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .code-lang {
            font-size: 0.72rem; font-weight: 700;
            color: #89b4fa; font-family: monospace; letter-spacing: 0.8px;
        }
        .copy-code-btn {
            background: rgba(255, 255, 255, 0.1);
            border: none; color: #cdd6f4;
            font-size: 0.72rem; padding: 3px 8px;
            border-radius: 4px; cursor: pointer;
            transition: all 0.2s;
        }
        .copy-code-btn:hover { background: var(--accent-color); color: #11111b; font-weight: 700; }
        .code-pre {
            margin: 0; padding: 12px;
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

        .md-li { margin-left: 16px; list-style-type: disc; margin-bottom: 3px; }
        .badge-alert {
            padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 700;
            display: inline-block; margin: 2px 0;
        }
        .alert-warning { background: rgba(243, 139, 168, 0.2); color: #f38ba8; border: 1px solid #f38ba8; }
        .alert-info { background: rgba(137, 180, 250, 0.2); color: #89b4fa; border: 1px solid #89b4fa; }

        /* Typing & Input Controls */
        .typing-indicator {
            display: none; align-self: flex-start;
            padding: 8px 12px; background: var(--assistant-msg-bg);
            border: 1px solid var(--assistant-msg-border);
            border-radius: 12px; border-bottom-left-radius: 2px;
            gap: 4px; align-items: center; margin: 0 12px 8px 12px;
        }
        .typing-indicator.active { display: flex; }
        .dot {
            width: 6px; height: 6px;
            background: var(--accent-color); border-radius: 50%;
            animation: bounce 1.2s infinite ease-in-out;
        }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }

        .input-area {
            padding: 10px 12px; background: rgba(0, 0, 0, 0.2);
            border-top: 1px solid var(--border-color);
            display: flex; flex-direction: column; gap: 8px;
        }
        .input-wrapper { display: flex; gap: 8px; align-items: flex-end; }
        textarea {
            flex: 1; background: var(--input-bg); color: var(--input-fg);
            border: 1px solid var(--input-border); border-radius: 8px;
            padding: 8px 10px; font-family: inherit; font-size: 0.85rem;
            resize: none; outline: none; min-height: 38px; max-height: 120px;
            transition: border-color 0.2s;
        }
        textarea:focus { border-color: var(--accent-color); }
        .send-btn {
            background: linear-gradient(135deg, #89b4fa, #cba6f7);
            color: #11111b; border: none; border-radius: 8px;
            padding: 8px 14px; font-weight: 700; font-size: 0.85rem;
            cursor: pointer; height: 38px; display: flex;
            align-items: center; justify-content: center;
            transition: transform 0.1s, opacity 0.2s;
        }
        .send-btn:hover { opacity: 0.9; transform: translateY(-1px); }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-title">
            <span class="status-dot"></span>
            <span>${title}</span>
        </div>
        <button class="clear-btn" id="clear-btn" title="Clear Chat">Clear</button>
    </div>

    <div id="chat-messages">
        <div class="message-row assistant">
            <div class="sender-tag">Arika</div>
            <div class="bubble" id="welcome-bubble">Welcome to <strong>Arika</strong>! Ask me anything about your codebase or request code explanations below.</div>
        </div>
    </div>

    <div class="typing-indicator" id="typing-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    </div>

    <div class="input-area">
        <div class="input-wrapper">
            <textarea id="prompt-input" placeholder="Ask Arika..." rows="1"></textarea>
            <button class="send-btn" id="send-btn">Send</button>
            <button class="send-btn" id="stop-btn" style="display:none; background: #f38ba8; color: #11111b;">Stop</button>
        </div>
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
            // Fix invalid unicode math symbols into valid C/C++ operators
            let c = code
                .replace(/≠/g, '!=')
                .replace(/→/g, '->')
                .replace(/≤/g, '<=')
                .replace(/≥/g, '>=');

            let safe = escapeHtml(c);

            // Extract comments first
            const comments = [];
            safe = safe.replace(/(\\/\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)/g, function(m) {
                const i = comments.length;
                comments.push('<span class="syn-comment">' + m + '</span>');
                return '___COMMENT_' + i + '___';
            });

            // Extract strings
            const strings = [];
            safe = safe.replace(/("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*')/g, function(m) {
                const i = strings.length;
                strings.push('<span class="syn-string">' + m + '</span>');
                return '___STRING_' + i + '___';
            });

            // Colorize C/C++/Java/TS Keywords
            const keywords = /\\b(void|int|char|float|double|long|short|unsigned|signed|struct|enum|union|typedef|if|else|while|for|do|return|break|continue|switch|case|default|const|static|volatile|extern|inline|public|private|protected|class|template|typename|using|namespace|new|delete|try|catch|throw|auto|async|await|function|let|var|import|export|from)\\b/g;
            safe = safe.replace(keywords, '<span class="syn-keyword">$1</span>');

            // Types & Constants
            safe = safe.replace(/\\b(Node|NULL|RED|BLACK|true|false|TRUE|FALSE|nullptr|std|size_t)\\b/g, '<span class="syn-type">$1</span>');

            // Operators (-> and != and ==)
            safe = safe.replace(/(-&gt;|!=|==|=&gt;)/g, '<span class="syn-operator">$1</span>');

            // Function calls
            safe = safe.replace(/\\b([a-zA-Z_]\\w*)(?=\\s*\\()/g, '<span class="syn-func">$1</span>');

            // Numbers
            safe = safe.replace(/\\b(\\d+(\\.\\d+)?)\\b/g, '<span class="syn-number">$1</span>');

            // Restore strings and comments using split/join
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
                            '<button class="copy-code-btn" onclick="copyCodeText(this)">Copy Code</button>' +
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

            // Headers
            html = html.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
            html = html.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
            html = html.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');

            // Bold
            html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="md-bold">$1</strong>');
            html = html.replace(/__(.*?)__/g, '<strong class="md-bold">$1</strong>');

            // Italics
            html = html.replace(/\\*(.*?)\\*/g, '<em class="md-italic">$1</em>');

            // Badges / Alerts
            html = html.replace(/\\[(IMPORTANT|WARNING|CAUTION)\\]/gi, '<span class="badge-alert alert-warning">$1</span>');
            html = html.replace(/\\[(NOTE|TIP|INFO)\\]/gi, '<span class="badge-alert alert-info">$1</span>');

            // Lists
            html = html.replace(/^\\s*[-*]\\s+(.*$)/gim, '<div class="md-li">$1</div>');

            // Newlines
            html = html.replace(/\\n\\n/g, '<br/><br/>');
            html = html.replace(/\\n/g, '<br/>');

            // Restore Code Blocks using split and join
            codeBlocks.forEach(function(block, i) {
                const placeholder = '%%%CODEBLOCK_' + i + '%%%';
                html = html.split(placeholder).join(block);
            });

            return html;
        }

        (function() {
            const vscode = acquireVsCodeApi();
            const messagesContainer = document.getElementById('chat-messages');
            const promptInput = document.getElementById('prompt-input');
            const sendBtn = document.getElementById('send-btn');
            const stopBtn = document.getElementById('stop-btn');
            const clearBtn = document.getElementById('clear-btn');
            const typingIndicator = document.getElementById('typing-indicator');

            function scrollToBottom() {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

            function appendMessage(sender, rawText, isUser) {
                const row = document.createElement('div');
                row.className = 'message-row ' + (isUser ? 'user' : 'assistant');
                const tag = document.createElement('div');
                tag.className = 'sender-tag';
                tag.textContent = sender;
                const bubble = document.createElement('div');
                bubble.className = 'bubble';
                if (isUser) {
                    bubble.textContent = rawText;
                } else {
                    bubble.innerHTML = renderRichMarkdown(rawText);
                }
                row.appendChild(tag);
                row.appendChild(bubble);
                messagesContainer.appendChild(row);
                scrollToBottom();
                return bubble;
            }

            function handleSend() {
                const text = promptInput.value.trim();
                if (!text) return;
                appendMessage('You', text, true);
                vscode.postMessage({ command: 'sendMessage', text: text });
                promptInput.value = '';
                promptInput.style.height = '38px';
            }

            sendBtn.addEventListener('click', handleSend);
            promptInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            });

            promptInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });

            clearBtn.addEventListener('click', function() {
                messagesContainer.innerHTML = '';
                vscode.postMessage({ command: 'clearHistory' });
            });

            let currentStreamBubble = null;
            let currentStreamRawText = '';

            stopBtn.addEventListener('click', function() {
                vscode.postMessage({ command: 'cancelRequest' });
                sendBtn.style.display = 'block';
                stopBtn.style.display = 'none';
            });

            window.addEventListener('message', function(event) {
                const message = event.data;
                switch (message.command) {
                    case 'receiveMessage':
                        appendMessage(message.sender, message.text, false);
                        break;
                    case 'startStream':
                        sendBtn.style.display = 'none';
                        stopBtn.style.display = 'block';
                        currentStreamRawText = '';
                        const row = document.createElement('div');
                        row.className = 'message-row assistant';
                        const tag = document.createElement('div');
                        tag.className = 'sender-tag';
                        tag.textContent = message.sender || 'Arika';
                        currentStreamBubble = document.createElement('div');
                        currentStreamBubble.className = 'bubble';
                        row.appendChild(tag);
                        row.appendChild(currentStreamBubble);
                        messagesContainer.appendChild(row);
                        scrollToBottom();
                        break;
                    case 'streamChunk':
                        if (currentStreamBubble) {
                            currentStreamRawText += message.text;
                            currentStreamBubble.innerHTML = renderRichMarkdown(currentStreamRawText);
                            scrollToBottom();
                        }
                        break;
                    case 'endStream':
                        currentStreamBubble = null;
                        currentStreamRawText = '';
                        sendBtn.style.display = 'block';
                        stopBtn.style.display = 'none';
                        break;
                    case 'setLoading':
                        if (message.loading) {
                            typingIndicator.classList.add('active');
                        } else {
                            typingIndicator.classList.remove('active');
                            sendBtn.style.display = 'block';
                            stopBtn.style.display = 'none';
                        }
                        scrollToBottom();
                        break;
                }
            });
        })();
    </script>
</body>
</html>`;
    }
}
