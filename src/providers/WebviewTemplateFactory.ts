/**
 * Decoupled HTML/CSS/JS template generator factory for CodeTitan webviews.
 */
export class WebviewTemplateFactory {
    /**
     * Generates Sidebar Webview HTML content.
     */
    public static getSidebarHtml(title: string = 'CodeTitan'): string {
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
            --border-color: var(--vscode-sideBar-border, rgba(255, 255, 255, 0.1));
            --input-bg: var(--vscode-input-background, #181825);
            --input-fg: var(--vscode-input-foreground, #cdd6f4);
            --input-border: var(--vscode-input-border, rgba(255, 255, 255, 0.15));
            --user-msg-bg: linear-gradient(135deg, #6c5ce7, #89b4fa);
            --user-msg-fg: #ffffff;
            --assistant-msg-bg: rgba(255, 255, 255, 0.05);
            --assistant-msg-border: rgba(137, 180, 250, 0.2);
            --accent-color: #89b4fa;
            --accent-hover: #b4befe;
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

        .header {
            padding: 12px 14px;
            background: rgba(0, 0, 0, 0.15);
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

        #chat-messages {
            flex: 1; padding: 12px;
            overflow-y: auto; display: flex;
            flex-direction: column; gap: 12px;
            scroll-behavior: smooth;
        }

        .message-row {
            display: flex; flex-direction: column;
            max-width: 90%;
            animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .message-row.user { align-self: flex-end; }
        .message-row.assistant { align-self: flex-start; }

        .sender-tag {
            font-size: 0.7rem; font-weight: 600;
            margin-bottom: 3px; opacity: 0.75; padding-left: 2px;
        }
        .message-row.user .sender-tag { align-self: flex-end; color: var(--accent-hover); }
        .message-row.assistant .sender-tag { align-self: flex-start; color: var(--accent-color); }

        .bubble {
            padding: 10px 14px; border-radius: 12px;
            font-size: 0.88rem; line-height: 1.45;
            word-wrap: break-word; white-space: pre-wrap;
        }
        .message-row.user .bubble {
            background: var(--user-msg-bg); color: var(--user-msg-fg);
            border-bottom-right-radius: 2px;
            box-shadow: 0 2px 8px rgba(108, 92, 231, 0.3);
        }
        .message-row.assistant .bubble {
            background-color: var(--assistant-msg-bg);
            border: 1px solid var(--assistant-msg-border);
            border-bottom-left-radius: 2px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

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
            <div class="sender-tag">CodeTitan</div>
            <div class="bubble">Welcome to CodeTitan! Ask me anything about your project or type code prompts below.</div>
        </div>
    </div>

    <div class="typing-indicator" id="typing-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    </div>

    <div class="input-area">
        <div class="input-wrapper">
            <textarea id="prompt-input" placeholder="Ask CodeTitan..." rows="1"></textarea>
            <button class="send-btn" id="send-btn">Send</button>
            <button class="send-btn" id="stop-btn" style="display:none; background: #f38ba8; color: #11111b;">Stop</button>
        </div>
    </div>

    <script>
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

            function appendMessage(sender, text, isUser) {
                const row = document.createElement('div');
                row.className = 'message-row ' + (isUser ? 'user' : 'assistant');
                const tag = document.createElement('div');
                tag.className = 'sender-tag';
                tag.textContent = sender;
                const bubble = document.createElement('div');
                bubble.className = 'bubble';
                bubble.textContent = text;
                row.appendChild(tag);
                row.appendChild(bubble);
                messagesContainer.appendChild(row);
                scrollToBottom();
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
                        const row = document.createElement('div');
                        row.className = 'message-row assistant';
                        const tag = document.createElement('div');
                        tag.className = 'sender-tag';
                        tag.textContent = message.sender || 'CodeTitan';
                        currentStreamBubble = document.createElement('div');
                        currentStreamBubble.className = 'bubble';
                        row.appendChild(tag);
                        row.appendChild(currentStreamBubble);
                        messagesContainer.appendChild(row);
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
