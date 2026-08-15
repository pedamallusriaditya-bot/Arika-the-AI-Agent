import * as vscode from 'vscode';
import { IAIService, CurrentFileContext } from './AIService';
import { ISearchService, SearchResult } from './SearchService';
import { IWorkspaceScanner } from './WorkspaceScanner';
import { IContextBuilder } from './ContextBuilder';
import { Logger } from '../utils/logger';

export interface IRepoQAService {
    askRepo(
        question: string,
        onChunk: (chunk: string) => void,
        activeFileContext?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string>;
}

export class RepoQAService implements IRepoQAService {
    constructor(
        private readonly aiService: IAIService,
        private readonly searchService: ISearchService,
        private readonly workspaceScanner: IWorkspaceScanner,
        private readonly contextBuilder: IContextBuilder
    ) {}

    /**
     * Answers repository-wide questions by searching files, building context, and querying AI service.
     */
    public async askRepo(
        question: string,
        onChunk: (chunk: string) => void,
        activeFileContext?: CurrentFileContext,
        cancelToken?: vscode.CancellationToken
    ): Promise<string> {
        Logger.info(`[RepoQAService] Answering repository query: "${question}"`);

        // 1. Extract search terms from question
        const searchTerms = this.extractSearchTerms(question);
        Logger.info(`[RepoQAService] Extracted search terms: ${searchTerms.join(', ')}`);

        // 2. Perform parallel codebase search using SearchService
        const searchResults = await this.performSearch(searchTerms);
        Logger.info(`[RepoQAService] Search produced ${searchResults.length} ranked matches.`);

        // 3. Obtain project structure using WorkspaceScanner
        let projectTree;
        try {
            projectTree = await this.workspaceScanner.scan(4, 1000);
        } catch (err: any) {
            Logger.warn(`[RepoQAService] Failed to retrieve workspace tree summary: ${err?.message || err}`);
        }

        // 4. Build custom context metadata for Search Findings
        const searchFindingsText = this.formatSearchResults(searchResults);

        // 5. Build token-budgeted prompt using ContextBuilder
        const promptPayload = this.contextBuilder.buildOptimizedPrompt(
            {
                userQuestion: question,
                activeFile: activeFileContext,
                projectTree,
                selectedCode: searchFindingsText
            },
            {
                maxCharacterBudget: 3500,
                maxFileContentLength: 1500,
                includeProjectTree: true
            }
        );

        // 6. Enrich system prompt with repository QA instructions
        const repoSystemPrompt = `${promptPayload.systemPrompt}
You are performing Repository Question Answering.
When explaining findings, reference relevant files clearly using file paths (e.g. \`src/services/AIService.ts\`).
Provide concrete architectural insights, file responsibilities, and line references where applicable.`;

        // 7. Query AI Service with streaming responses and cancellation support
        try {
            return await this.aiService.askStream(
                `${repoSystemPrompt}\n\n${promptPayload.userPrompt}`,
                onChunk,
                undefined,
                cancelToken
            );
        } catch (error) {
            Logger.error('[RepoQAService] Error querying AI for repository QA', error);
            const errorMsg = '⚠️ Failed to complete repository QA. Please check your network or API key configuration.';
            onChunk(errorMsg);
            return errorMsg;
        }
    }

    /**
     * Extracts meaningful search keywords from natural language question.
     */
    private extractSearchTerms(question: string): string[] {
        const stopWords = new Set([
            'where', 'is', 'are', 'how', 'what', 'does', 'do', 'can', 'the', 'a', 'an',
            'in', 'on', 'of', 'for', 'to', 'with', 'and', 'or', 'implemented', 'defined',
            'located', 'find', 'show', 'me', 'tell', 'about', 'this', 'project', 'repo', 'codebase'
        ]);

        const tokens = question
            .replace(/[^a-zA-Z0-9_$]/g, ' ')
            .split(/\s+/)
            .filter((term) => term.length > 2 && !stopWords.has(term.toLowerCase()));

        return Array.from(new Set(tokens));
    }

    /**
     * Executes parallel searches across terms using Promise.all.
     */
    private async performSearch(terms: string[]): Promise<SearchResult[]> {
        if (terms.length === 0) {
            return [];
        }

        const searchPromises = terms.map((term) =>
            this.searchService.search({
                query: term,
                type: 'all',
                maxResults: 10
            })
        );

        const resultsArray = await Promise.all(searchPromises);
        const allMatches: SearchResult[] = resultsArray.flat();

        // Deduplicate and rank top 15 results
        const map = new Map<string, SearchResult>();
        for (const match of allMatches) {
            const key = `${match.filePath}:${match.lineNumber || 0}`;
            if (!map.has(key) || (map.get(key)!.score || 0) < (match.score || 0)) {
                map.set(key, match);
            }
        }

        return Array.from(map.values())
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 15);
    }

    /**
     * Formats search findings into clean readable markdown.
     */
    private formatSearchResults(results: SearchResult[]): string | undefined {
        if (results.length === 0) {
            return undefined;
        }

        let formatted = '### Codebase Search Matches\n';
        for (const res of results) {
            const lineInfo = res.lineNumber ? ` (Line ${res.lineNumber})` : '';
            formatted += `- **${res.fileName}**${lineInfo} [${res.matchType}]: \`${res.matchedText}\`\n`;
            if (res.lineSnippet) {
                formatted += `  \`${res.lineSnippet}\`\n`;
            }
        }
        return formatted;
    }
}
