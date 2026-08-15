import { GoogleGenerativeAI } from '@google/generative-ai';
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
    private geminiClient: GoogleGenerativeAI | undefined;
    private openaiClient: OpenAI | undefined;

    private readonly openaiModelName: string = 'gpt-4o-mini';

    constructor() {
        this.initializeClients();
    }

    private initializeClients(): void {
        const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
        const openaiKey = process.env.OPENAI_API_KEY?.trim();

        if (geminiKey) {
            if (!geminiKey.startsWith('AIzaSy')) {
                Logger.warn('[AIService] GEMINI_API_KEY does not start with "AIzaSy". Google AI Studio API keys always begin with "AIzaSy".');
            }
            try {
                this.geminiClient = new GoogleGenerativeAI(geminiKey);
                Logger.info('[AIService] Google Gemini client initialized successfully.');
            } catch (error) {
                Logger.error('[AIService] Failed to initialize Google Gemini client', error);
                this.geminiClient = undefined;
            }
        }

        if (openaiKey) {
            try {
                this.openaiClient = new OpenAI({ apiKey: openaiKey });
                Logger.info('[AIService] OpenAI client initialized successfully with OPENAI_API_KEY.');
            } catch (error) {
                Logger.error('[AIService] Failed to initialize OpenAI client', error);
                this.openaiClient = undefined;
            }
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
     * Executes a streaming query using Gemini (preferred) or OpenAI (fallback).
     */
    public async askStream(
        prompt: string,
        onChunk: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        Logger.info(`[AIService] Executing streaming prompt (${prompt.length} chars)${context ? ` [${context.fileName}]` : ''}`);

        // Re-check client initializations if env vars changed dynamically
        if (!this.geminiClient && !this.openaiClient) {
            this.initializeClients();
        }

        const trimmed = prompt.trim();
        if (!trimmed) {
            const emptyPromptMsg = 'Please enter a non-empty message or prompt.';
            onChunk(emptyPromptMsg);
            return emptyPromptMsg;
        }

        // Build system prompt with workspace context
        let systemInstruction = 'You are Arika CodeTitan, a world-class AI coding assistant. Provide clear, concise, accurate, and beautifully structured responses with syntax-highlighted markdown code blocks.';

        if (context) {
            const maxLen = 4000;
            let fileSnippet = context.content;
            if (fileSnippet.length > maxLen) {
                const totalLines = context.content.split('\n').length;
                fileSnippet = `${context.content.slice(0, maxLen)}\n\n[... truncated ${totalLines} total lines for token budget efficiency ...]`;
            }

            systemInstruction += `\n\n--- ACTIVE WORKSPACE FILE CONTEXT ---
- File Name: ${context.fileName}
- Language: ${context.languageId}
- Path: ${context.filePath || 'N/A'}

--- FILE SNIPPET ---
\`\`\`${context.languageId}
${fileSnippet}
\`\`\``;
        }

        // Use Google Gemini API if client is available
        if (this.geminiClient) {
            return this.askGeminiStream(systemInstruction, trimmed, onChunk, cancelToken);
        }

        // Fallback to OpenAI API if client is available
        if (this.openaiClient) {
            return this.askOpenAIStream(systemInstruction, trimmed, onChunk, cancelToken);
        }

        const noKeyMsg = '⚠️ No valid AI API Key found. Please set `GEMINI_API_KEY` or `OPENAI_API_KEY` in your `.env` file.';
        Logger.error(`[AIService] ${noKeyMsg}`);
        onChunk(noKeyMsg);
        return noKeyMsg;
    }

    /**
     * Executes real-time token streaming using Google Gemini SDK with automated model fallback.
     */
    private async askGeminiStream(
        systemInstruction: string,
        userPrompt: string,
        onChunk: (chunk: string) => void,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        const candidateModels = [
            'gemini-2.0-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro-latest',
            'gemini-2.0-flash-exp',
            'gemini-pro'
        ];

        let lastError: any = null;

        for (const modelName of candidateModels) {
            try {
                Logger.info(`[AIService] Attempting Gemini stream with model [${modelName}]...`);
                const model = this.geminiClient!.getGenerativeModel({
                    model: modelName,
                    systemInstruction
                });

                const resultStream = await model.generateContentStream(userPrompt);
                let accumulatedText = '';

                for await (const chunk of resultStream.stream) {
                    if (cancelToken?.isCancellationRequested) {
                        Logger.info('[AIService] Stream cancelled by user (Gemini).');
                        const cancelMsg = '\n\n🛑 *Generation cancelled by user.*';
                        onChunk(cancelMsg);
                        return accumulatedText + cancelMsg;
                    }

                    const token = chunk.text();
                    if (token) {
                        accumulatedText += token;
                        onChunk(token);
                    }
                }

                return accumulatedText;
            } catch (error: any) {
                lastError = error;
                const isNotFound = error?.status === 404 || error?.message?.includes('404') || error?.message?.includes('not found');
                if (isNotFound) {
                    Logger.warn(`[AIService] Model [${modelName}] returned 404 / Not Found. Trying next fallback model...`);
                    continue;
                }
                break;
            }
        }

        Logger.error('[AIService] Gemini API Exception across all candidate models', lastError);
        const formattedError = this.formatErrorMessage(lastError, 'Gemini');
        onChunk(formattedError);
        return formattedError;
    }

    /**
     * Executes real-time token streaming using OpenAI SDK.
     */
    private async askOpenAIStream(
        systemInstruction: string,
        userPrompt: string,
        onChunk: (chunk: string) => void,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        try {
            const responseStream = await this.openaiClient!.chat.completions.create({
                model: this.openaiModelName,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: userPrompt }
                ],
                stream: true,
                temperature: 0.7
            });

            let accumulatedText = '';

            for await (const chunk of responseStream) {
                if (cancelToken?.isCancellationRequested) {
                    Logger.info('[AIService] Stream cancelled by user (OpenAI).');
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

            return accumulatedText;
        } catch (error: any) {
            Logger.error('[AIService] OpenAI API Exception', error);
            const formattedError = this.formatErrorMessage(error, 'OpenAI');
            onChunk(formattedError);
            return formattedError;
        }
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

    private formatErrorMessage(error: any, provider: string): string {
        const msg = error?.message || '';
        const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();

        if (provider === 'Gemini' && geminiKey && !geminiKey.startsWith('AIzaSy')) {
            return `⚠️ **Invalid Gemini API Key Format**: The \`GEMINI_API_KEY\` in your \`.env\` file does not start with \`AIzaSy...\` (Google AI Studio keys always start with \`AIzaSy...\`).\n\n👉 **How to get a free key:**\n1. Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).\n2. Click **Create API Key** and copy the string starting with \`AIzaSy...\` into your \`.env\` file.`;
        }

        if (error?.status === 401 || msg.includes('401') || msg.includes('API_KEY_INVALID')) {
            return `⚠️ **${provider} Auth Error**: Invalid or expired API Key. Please check your \`.env\` configuration.`;
        }
        if (error?.status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
            return `⚠️ **${provider} Quota / Rate Limit Exceeded**: You have reached the rate limit or run out of credits for ${provider}.`;
        }
        return `⚠️ **${provider} Error**: ${msg || 'An unexpected error occurred while communicating with AI service.'}`;
    }
}
