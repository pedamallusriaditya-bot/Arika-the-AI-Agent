import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    timestamp: number;
}

export interface SessionState {
    sessionId: string;
    summary?: string;
    messages: ChatMessage[];
    updatedAt: number;
}

export interface IChatMemory {
    addMessage(role: ChatRole, content: string): Promise<ChatMessage>;
    getMessages(): ChatMessage[];
    getFormattedHistory(): { role: 'user' | 'assistant' | 'system'; content: string }[];
    getSummary(): string | undefined;
    clearHistory(): Promise<void>;
    restoreSession(): Promise<void>;
}

export class ChatMemory implements IChatMemory {
    private static readonly STORAGE_KEY = 'arika.chatMemorySession';
    private sessionId: string;
    private messages: ChatMessage[] = [];
    private sessionSummary?: string;
    private readonly maxCharacterBudget: number;

    constructor(
        private readonly workspaceState: vscode.Memento,
        maxCharacterBudget: number = 8000
    ) {
        this.sessionId = `session_${Date.now()}`;
        this.maxCharacterBudget = maxCharacterBudget;
        this.restoreSessionSync();
    }

    /**
     * Adds a new turn message to memory and maintains token budget constraints.
     */
    public async addMessage(role: ChatRole, content: string): Promise<ChatMessage> {
        const newMessage: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            role,
            content,
            timestamp: Date.now()
        };

        this.messages.push(newMessage);
        await this.enforceBudgetAndSummarize();
        await this.persistSession();
        return newMessage;
    }

    /**
     * Returns active message history.
     */
    public getMessages(): ChatMessage[] {
        return [...this.messages];
    }

    /**
     * Returns OpenAI/LLM formatted message history.
     */
    public getFormattedHistory(): { role: 'user' | 'assistant' | 'system'; content: string }[] {
        const history: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

        if (this.sessionSummary) {
            history.push({
                role: 'system',
                content: `Prior Conversation Summary:\n${this.sessionSummary}`
            });
        }

        for (const msg of this.messages) {
            history.push({
                role: msg.role,
                content: msg.content
            });
        }

        return history;
    }

    /**
     * Returns current session summary if available.
     */
    public getSummary(): string | undefined {
        return this.sessionSummary;
    }

    /**
     * Clears all session messages and summary from memory and persistent workspaceState.
     */
    public async clearHistory(): Promise<void> {
        this.messages = [];
        this.sessionSummary = undefined;
        this.sessionId = `session_${Date.now()}`;
        await this.workspaceState.update(ChatMemory.STORAGE_KEY, undefined);
        Logger.info('[ChatMemory] Chat memory cleared and workspaceState reset.');
    }

    /**
     * Restores session state from persistent Memento storage.
     */
    public async restoreSession(): Promise<void> {
        this.restoreSessionSync();
    }

    private restoreSessionSync(): void {
        try {
            const savedState = this.workspaceState.get<SessionState>(ChatMemory.STORAGE_KEY);
            if (savedState) {
                this.sessionId = savedState.sessionId || this.sessionId;
                this.messages = savedState.messages || [];
                this.sessionSummary = savedState.summary;
                Logger.info(`[ChatMemory] Restored session [${this.sessionId}] with ${this.messages.length} messages from workspaceState.`);
            }
        } catch (error) {
            Logger.error('[ChatMemory] Error restoring session state from workspaceState', error);
        }
    }

    /**
     * Saves current session state to persistent VS Code workspaceState.
     */
    private async persistSession(): Promise<void> {
        try {
            const stateToSave: SessionState = {
                sessionId: this.sessionId,
                summary: this.sessionSummary,
                messages: this.messages,
                updatedAt: Date.now()
            };
            await this.workspaceState.update(ChatMemory.STORAGE_KEY, stateToSave);
        } catch (error) {
            Logger.error('[ChatMemory] Failed to persist session state to workspaceState', error);
        }
    }

    /**
     * Enforces character/token budget limits by auto-summarizing old messages.
     */
    private async enforceBudgetAndSummarize(): Promise<void> {
        let totalChars = this.messages.reduce((sum, m) => sum + m.content.length, 0);

        if (totalChars <= this.maxCharacterBudget || this.messages.length <= 4) {
            return;
        }

        Logger.info(`[ChatMemory] Character budget exceeded (${totalChars} / ${this.maxCharacterBudget}). Auto-summarizing legacy turns.`);

        // Keep last 4 messages in active buffer, summarize older ones
        const overflowCount = this.messages.length - 4;
        const messagesToSummarize = this.messages.splice(0, overflowCount);

        const summaryItems = messagesToSummarize.map(
            (m) => `- ${m.role.toUpperCase()}: ${m.content.slice(0, 150)}${m.content.length > 150 ? '...' : ''}`
        );

        const newSummary = `Summarized ${messagesToSummarize.length} prior turn(s):\n${summaryItems.join('\n')}`;

        if (this.sessionSummary) {
            this.sessionSummary = `${this.sessionSummary}\n\n${newSummary}`;
        } else {
            this.sessionSummary = newSummary;
        }

        Logger.info(`[ChatMemory] Auto-summarization complete. Active buffer reduced to ${this.messages.length} messages.`);
    }
}
