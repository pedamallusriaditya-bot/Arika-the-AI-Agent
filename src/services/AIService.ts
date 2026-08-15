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
    private groqClient: OpenAI | undefined;
    private geminiClient: GoogleGenerativeAI | undefined;
    private openaiClient: OpenAI | undefined;

    private readonly groqModelName: string = 'llama-3.3-70b-versatile';
    private readonly openaiModelName: string = 'gpt-4o-mini';

    constructor() {
        this.initializeClients();
    }

    private initializeClients(): void {
        const groqKey = process.env.GROQ_API_KEY?.trim();
        const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
        const openaiKey = process.env.OPENAI_API_KEY?.trim();

        if (groqKey) {
            try {
                this.groqClient = new OpenAI({
                    apiKey: groqKey,
                    baseURL: 'https://api.groq.com/openai/v1'
                });
                Logger.info('[AIService] Groq API client initialized successfully with GROQ_API_KEY.');
            } catch (error) {
                Logger.error('[AIService] Failed to initialize Groq API client', error);
                this.groqClient = undefined;
            }
        }

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
     * Executes a streaming query using Groq (top priority), Gemini, or OpenAI.
     */
    public async askStream(
        prompt: string,
        onChunk: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        Logger.info(`[AIService] Executing streaming prompt (${prompt.length} chars)${context ? ` [${context.fileName}]` : ''}`);

        if (!this.groqClient && !this.geminiClient && !this.openaiClient) {
            this.initializeClients();
        }

        const trimmed = prompt.trim();
        if (!trimmed) {
            const emptyPromptMsg = 'Please enter a non-empty message or prompt.';
            onChunk(emptyPromptMsg);
            return emptyPromptMsg;
        }

        let systemInstruction = 'You are Arika, a world-class AI coding assistant. Provide clear, concise, accurate, and beautifully structured responses with syntax-highlighted markdown code blocks. CRITICAL CODE DIRECTIVE: ALWAYS output standard, valid, compilable code. NEVER use mathematical Unicode symbols in code blocks (e.g., use != instead of ≠, use -> instead of →, use <= instead of ≤, use >= instead of ≥).';

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

        // Priority 1: Groq API (Ultra-fast Llama 3.3 70B)
        if (this.groqClient) {
            return this.askOpenAICompatibleStream(this.groqClient, this.groqModelName, 'Groq', systemInstruction, trimmed, onChunk, cancelToken);
        }

        // Priority 2: Google Gemini API
        if (this.geminiClient) {
            return this.askGeminiStream(systemInstruction, trimmed, onChunk, cancelToken);
        }

        // Priority 3: OpenAI API
        if (this.openaiClient) {
            return this.askOpenAICompatibleStream(this.openaiClient, this.openaiModelName, 'OpenAI', systemInstruction, trimmed, onChunk, cancelToken);
        }

        const noKeyMsg = '⚠️ No valid AI API Key found. Please set `GROQ_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` in your `.env` file.';
        Logger.error(`[AIService] ${noKeyMsg}`);
        onChunk(noKeyMsg);
        return noKeyMsg;
    }

    /**
     * Executes real-time token streaming using OpenAI-compatible SDK clients (Groq / OpenAI).
     */
    private async askOpenAICompatibleStream(
        client: OpenAI,
        modelName: string,
        providerName: string,
        systemInstruction: string,
        userPrompt: string,
        onChunk: (chunk: string) => void,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        try {
            Logger.info(`[AIService] Streaming via ${providerName} [${modelName}]...`);
            const responseStream = await client.chat.completions.create({
                model: modelName,
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
                    Logger.info(`[AIService] Stream cancelled by user (${providerName}).`);
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
            Logger.error(`[AIService] ${providerName} API Exception`, error);
            const formattedError = this.formatErrorMessage(error, providerName);
            onChunk(formattedError);
            return formattedError;
        }
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
