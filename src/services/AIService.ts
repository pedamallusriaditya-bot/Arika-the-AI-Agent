import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import * as vscode from 'vscode';
import { AuthenticationError, NetworkError, RateLimitError } from '../errors/ExtensionError';
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
 * Single turn in conversational history.
 */
export interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Service contract for AI interactions.
 */
export interface IAIService {
    ask(
        prompt: string,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken,
        history?: ChatTurn[]
    ): Promise<string>;
    askStream(
        prompt: string,
        onChunk: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken,
        history?: ChatTurn[]
    ): Promise<string>;
    explainCode(
        code: string,
        languageId: string,
        onChunk?: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string>;
    setContext(context: vscode.ExtensionContext): void;
}

export class AIService implements IAIService {
    private extensionContext?: vscode.ExtensionContext;
    private groqClient: OpenAI | undefined;
    private geminiClient: GoogleGenerativeAI | undefined;
    private openaiClient: OpenAI | undefined;

    private readonly groqModelName: string = 'llama-3.3-70b-versatile';
    private readonly openaiModelName: string = 'gpt-4o-mini';

    constructor(context?: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.initializeClients();
    }

    public setContext(context: vscode.ExtensionContext): void {
        this.extensionContext = context;
        this.initializeClients();
    }

    public async initializeClients(): Promise<void> {
        let groqKey = process.env.GROQ_API_KEY?.trim();
        let geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
        let openaiKey = process.env.OPENAI_API_KEY?.trim();

        if (this.extensionContext?.secrets) {
            const secretGroq = await this.extensionContext.secrets.get('GROQ_API_KEY');
            const secretGemini = await this.extensionContext.secrets.get('GEMINI_API_KEY');
            const secretOpenAI = await this.extensionContext.secrets.get('OPENAI_API_KEY');

            if (secretGroq?.trim()) groqKey = secretGroq.trim();
            if (secretGemini?.trim()) geminiKey = secretGemini.trim();
            if (secretOpenAI?.trim()) openaiKey = secretOpenAI.trim();
        }

        if (groqKey) {
            try {
                this.groqClient = new OpenAI({
                    apiKey: groqKey,
                    baseURL: 'https://api.groq.com/openai/v1'
                });
                Logger.info('[AIService] Groq API client initialized with GROQ_API_KEY.');
            } catch (error) {
                Logger.error('[AIService] Failed to initialize Groq API client', error);
                this.groqClient = undefined;
            }
        }

        if (geminiKey) {
            if (!geminiKey.startsWith('AIzaSy')) {
                Logger.warn('[AIService] GEMINI_API_KEY does not start with "AIzaSy". Google AI Studio keys begin with "AIzaSy".');
            }
            try {
                this.geminiClient = new GoogleGenerativeAI(geminiKey);
                Logger.info('[AIService] Google Gemini client initialized.');
            } catch (error) {
                Logger.error('[AIService] Failed to initialize Google Gemini client', error);
                this.geminiClient = undefined;
            }
        }

        if (openaiKey) {
            try {
                this.openaiClient = new OpenAI({ apiKey: openaiKey });
                Logger.info('[AIService] OpenAI client initialized with OPENAI_API_KEY.');
            } catch (error) {
                Logger.error('[AIService] Failed to initialize OpenAI client', error);
                this.openaiClient = undefined;
            }
        }
    }

    public async ask(
        prompt: string,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken,
        history?: ChatTurn[]
    ): Promise<string> {
        let fullResponse = '';
        await this.askStream(
            prompt,
            (chunk) => {
                fullResponse += chunk;
            },
            context,
            cancelToken,
            history
        );
        return fullResponse;
    }

    /**
     * Executes a streaming query using Groq (top priority), Gemini, or OpenAI with optional history.
     */
    public async askStream(
        prompt: string,
        onChunk: (chunk: string) => void,
        context?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken,
        history: ChatTurn[] = []
    ): Promise<string> {
        Logger.info(`[AIService] Executing streaming prompt (${prompt.length} chars, ${history.length} history turns)${context ? ` [${context.fileName}]` : ''}`);

        if (!this.groqClient && !this.geminiClient && !this.openaiClient) {
            await this.initializeClients();
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
            return this.askOpenAICompatibleStream(this.groqClient, this.groqModelName, 'Groq', systemInstruction, trimmed, history, onChunk, cancelToken);
        }

        // Priority 2: Google Gemini API
        if (this.geminiClient) {
            return this.askGeminiStream(systemInstruction, trimmed, history, onChunk, cancelToken);
        }

        // Priority 3: OpenAI API
        if (this.openaiClient) {
            return this.askOpenAICompatibleStream(this.openaiClient, this.openaiModelName, 'OpenAI', systemInstruction, trimmed, history, onChunk, cancelToken);
        }

        const noKeyMsg = '⚠️ No valid AI API Key found. Please set `GROQ_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` in your `.env` file or use `Arika: Set API Key`.';
        Logger.error(`[AIService] ${noKeyMsg}`);
        onChunk(noKeyMsg);
        return noKeyMsg;
    }

    /**
     * Executes real-time token streaming using OpenAI-compatible SDK clients with multi-turn history.
     */
    private async askOpenAICompatibleStream(
        client: OpenAI,
        modelName: string,
        providerName: string,
        systemInstruction: string,
        userPrompt: string,
        history: ChatTurn[],
        onChunk: (chunk: string) => void,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        try {
            Logger.info(`[AIService] Streaming via ${providerName} [${modelName}] with ${history.length} history turns...`);

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'system', content: systemInstruction },
                ...history.map((h) => ({
                    role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
                    content: h.content
                })),
                { role: 'user', content: userPrompt }
            ];

            const responseStream = await client.chat.completions.create({
                model: modelName,
                messages,
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
            const typedError = this.wrapTypedError(error, providerName);
            const formattedError = this.formatErrorMessage(typedError, providerName);
            onChunk(formattedError);
            return formattedError;
        }
    }

    /**
     * Executes real-time token streaming using Google Gemini SDK with automated model fallback and history.
     */
    private async askGeminiStream(
        systemInstruction: string,
        userPrompt: string,
        history: ChatTurn[],
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

        const contents = [
            ...history.map((h) => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.content }]
            })),
            { role: 'user', parts: [{ text: userPrompt }] }
        ];

        for (const modelName of candidateModels) {
            try {
                Logger.info(`[AIService] Attempting Gemini stream with model [${modelName}]...`);
                const model = this.geminiClient!.getGenerativeModel({
                    model: modelName,
                    systemInstruction
                });

                const resultStream = await model.generateContentStream({ contents });
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

        Logger.error('[AIService] Gemini API Exception across candidate models', lastError);
        const typedError = this.wrapTypedError(lastError, 'Gemini');
        const formattedError = this.formatErrorMessage(typedError, 'Gemini');
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

    private wrapTypedError(error: any, provider: string): Error {
        const msg = error?.message || '';
        if (error?.status === 401 || msg.includes('401') || msg.includes('API_KEY_INVALID')) {
            return new AuthenticationError(`Invalid or missing ${provider} API Key.`, error);
        }
        if (error?.status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
            return new RateLimitError(`${provider} API rate limit or quota exceeded.`, error);
        }
        if (msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
            return new NetworkError(`Network connectivity failure communicating with ${provider}.`, error);
        }
        return error;
    }

    private formatErrorMessage(error: any, provider: string): string {
        if (error instanceof AuthenticationError) {
            return `⚠️ **${provider} Auth Error**: ${error.message}`;
        }
        if (error instanceof RateLimitError) {
            return `⚠️ **${provider} Quota Exceeded**: ${error.message}`;
        }
        if (error instanceof NetworkError) {
            return `⚠️ **${provider} Network Error**: ${error.message}`;
        }
        return `⚠️ **${provider} Error**: ${error?.message || 'An unexpected error occurred.'}`;
    }
}
