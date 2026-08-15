import OpenAI from 'openai';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * Metadata and contents of the currently active workspace file.
 */
export interface CurrentFileContext {
    fileName: string;
    languageId: string;
    content: string;
    filePath?: string;
}

/**
 * Service contract for AI interactions.
 */
export interface IAIService {
    ask(prompt: string, context?: CurrentFileContext, cancelToken?: vscode.CancellationToken): Promise<string>;
    askStream(
        prompt: string,
        onChunk: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string>;
    explainCode(
        code: string,
        languageId: string,
        onChunk?: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string>;
}

export class AIService implements IAIService {
    private openaiClient: OpenAI | undefined;
    private readonly defaultModel: string = 'gpt-4o-mini';

    constructor() {
        this.initializeClient();
    }

    private initializeClient(): void {
        const apiKey = process.env.OPENAI_API_KEY?.trim();

        if (!apiKey) {
            Logger.warn('[AIService] OPENAI_API_KEY environment variable is not set. Real AI responses require a valid API key.');
            this.openaiClient = undefined;
            return;
        }

        try {
            this.openaiClient = new OpenAI({ apiKey });
            Logger.info('[AIService] OpenAI client successfully initialized using environment variable API key.');
        } catch (error) {
            Logger.error('[AIService] Failed to construct OpenAI client instance', error);
            this.openaiClient = undefined;
        }
    }

    public async ask(
        prompt: string,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        let fullResponse = '';
        await this.askStream(prompt, (chunk) => {
            fullResponse += chunk;
        }, context, cancelToken);
        return fullResponse;
    }

    /**
     * Executes a streaming query to OpenAI with retry resilience and cancellation support.
     */
    public async askStream(
        prompt: string,
        onChunk: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        Logger.info(`[AIService] Executing streaming prompt (${prompt.length} chars)${context ? ` [${context.fileName}]` : ''}`);

        if (!this.openaiClient) {
            this.initializeClient();
        }

        if (!this.openaiClient) {
            const errorMsg = '⚠️ OpenAI API key not found. Please set your OPENAI_API_KEY in the .env file or environment variables.';
            Logger.error(`[AIService] ${errorMsg}`);
            onChunk(errorMsg);
            return errorMsg;
        }

        const trimmed = prompt.trim();
        if (!trimmed) {
            const emptyPromptMsg = 'Please enter a non-empty message or prompt.';
            onChunk(emptyPromptMsg);
            return emptyPromptMsg;
        }

        let systemPrompt = 'You are Arika CodeTitan, a world-class AI coding assistant. Provide clear, concise, accurate, and beautifully structured responses with syntax-highlighted markdown code blocks.';

        if (context) {
            systemPrompt += `\n\n--- ACTIVE WORKSPACE FILE CONTEXT ---
- File Name: ${context.fileName}
- Language: ${context.languageId}
- Path: ${context.filePath || 'N/A'}

--- FILE CONTENTS ---
\`\`\`${context.languageId}
${context.content}
\`\`\``;
        }

        // Retry loop parameters
        const maxRetries = 2;
        let attempt = 0;

        while (attempt <= maxRetries) {
            if (cancelToken?.isCancellationRequested) {
                const cancelMsg = '\n\n🛑 *Generation cancelled by user.*';
                onChunk(cancelMsg);
                return cancelMsg;
            }

            try {
                const responseStream = await this.openaiClient.chat.completions.create({
                    model: this.defaultModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: trimmed }
                    ],
                    stream: true,
                    temperature: 0.7
                });

                let accumulatedText = '';

                for await (const chunk of responseStream) {
                    if (cancelToken?.isCancellationRequested) {
                        Logger.info('[AIService] Stream cancelled by CancellationToken during chunk iteration.');
                        const cancelMsg = '\n\n🛑 *Generation cancelled by user.*';
                        onChunk(cancelMsg);
                        return accumulatedText + cancelMsg;
                    }

                    const token = chunk.choices[0]?.delta?.content || '';
                    if (token) {
                        accumulatedText += token;
                        onChunk(token);
                    }
                }

                if (!accumulatedText.trim()) {
                    const fallback = 'No output generated by OpenAI.';
                    onChunk(fallback);
                    return fallback;
                }

                return accumulatedText;
            } catch (error: any) {
                attempt++;
                Logger.error(`[AIService] OpenAI Streaming API Exception (Attempt ${attempt}/${maxRetries + 1})`, error);

                if (attempt <= maxRetries && this.isTransientError(error)) {
                    Logger.info(`[AIService] Transient network failure detected. Retrying in ${attempt * 1000}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                    continue;
                }

                const userFriendlyError = this.formatErrorMessage(error);
                onChunk(userFriendlyError);
                return userFriendlyError;
            }
        }

        return '⚠️ Max network retries exceeded.';
    }

    public async explainCode(
        code: string,
        languageId: string,
        onChunk?: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        const prompt = `Explain this ${languageId} code snippet thoroughly:\n\n\`\`\`${languageId}\n${code}\n\`\`\``;
        if (onChunk) {
            return this.askStream(prompt, onChunk, context, cancelToken);
        }
        return this.ask(prompt, context, cancelToken);
    }

    private isTransientError(error: any): boolean {
        return (
            error?.code === 'ENOTFOUND' ||
            error?.code === 'ETIMEDOUT' ||
            error?.code === 'ECONNRESET' ||
            error?.status === 500 ||
            error?.status === 502 ||
            error?.status === 503
        );
    }

    private formatErrorMessage(error: any): string {
        if (error?.status === 401 || error?.message?.includes('401')) {
            return '⚠️ **OpenAI Auth Error**: Invalid or expired API Key. Please verify your `OPENAI_API_KEY` in `.env`.';
        }
        if (error?.status === 429 || error?.message?.includes('429')) {
            return '⚠️ **OpenAI Rate Limit / Quota Exceeded**: You have reached your rate limit or run out of credits.';
        }
        if (error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET') {
            return '⚠️ **Network Error**: Connection lost reaching OpenAI servers. Retries attempted.';
        }
        return `⚠️ **OpenAI Error**: ${error?.message || 'An unexpected error occurred while communicating with AI service.'}`;
    }
}
