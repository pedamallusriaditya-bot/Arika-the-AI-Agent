import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export type SearchType = 'all' | 'filename' | 'symbol' | 'keyword';
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'cpp' | 'c';

export interface SearchQuery {
    query: string;
    type?: SearchType;
    languages?: SupportedLanguage[];
    maxResults?: number;
}

export interface SearchResult {
    filePath: string;
    fileName: string;
    lineNumber?: number;
    matchType: 'filename' | 'symbol' | 'keyword';
    matchedText: string;
    lineSnippet?: string;
    score: number;
    languageId?: string;
}

export interface ISearchService {
    search(query: SearchQuery): Promise<SearchResult[]>;
    searchFilename(pattern: string, maxResults?: number): Promise<SearchResult[]>;
    searchSymbol(symbolName: string, languages?: SupportedLanguage[], maxResults?: number): Promise<SearchResult[]>;
    searchKeyword(keyword: string, maxResults?: number): Promise<SearchResult[]>;
    clearCache(): void;
}

export class SearchService implements ISearchService {
    private readonly defaultIgnoredDirectories: Set<string> = new Set([
        'node_modules',
        '.git',
        'dist',
        'build',
        'out',
        '.vscode',
        '.vscode-test',
        '.next',
        '.DS_Store',
        'coverage',
        'tmp'
    ]);

    private readonly defaultIgnoredFiles: Set<string> = new Set([
        '.env',
        '.env.local',
        '.env.production',
        'package-lock.json',
        'yarn.lock'
    ]);

    /**
     * In-memory cache for file contents to avoid disk I/O bottlenecks.
     */
    private readonly fileCache = new Map<string, { content: string; mtimeMs: number }>();

    /**
     * Regex matchers for symbols in supported programming languages.
     */
    private readonly symbolPatterns: Record<SupportedLanguage, RegExp[]> = {
        typescript: [
            /(?:export\s+)?(?:default\s+)?(?:class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g,
            /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
            /(?:public|private|protected|static|readonly|async|\s)+\s*([A-Za-z0-9_$]+)\s*\(/g
        ],
        javascript: [
            /(?:class|function)\s+([A-Za-z0-9_$]+)/g,
            /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g
        ],
        python: [
            /class\s+([A-Za-z0-9_]+)/g,
            /def\s+([A-Za-z0-9_]+)/g
        ],
        java: [
            /(?:public|protected|private|static|abstract|final|\s)*\s*(?:class|interface|enum|record)\s+([A-Za-z0-9_]+)/g,
            /(?:public|protected|private|static|final|native|synchronized|\s)+[\w<>\[\]]+\s+([A-Za-z0-9_]+)\s*\(/g
        ],
        cpp: [
            /(?:class|struct|enum|union|namespace)\s+([A-Za-z0-9_]+)/g,
            /(?:[A-Za-z0-9_<>:]+[\s\*&]+)+([A-Za-z0-9_]+)\s*\([^;]*\)\s*\{/g
        ],
        c: [
            /(?:struct|union|enum|typedef\s+struct)\s+([A-Za-z0-9_]+)/g,
            /(?:[A-Za-z0-9_]+[\s\*]+)+([A-Za-z0-9_]+)\s*\([^;]*\)\s*\{/g
        ]
    };

    constructor() {
        this.registerFileWatchers();
    }

    public clearCache(): void {
        this.fileCache.clear();
        Logger.info('[SearchService] Search file cache cleared.');
    }

    private registerFileWatchers(): void {
        try {
            vscode.workspace.onDidSaveTextDocument((doc) => {
                this.fileCache.delete(doc.fileName);
            });
            vscode.workspace.onDidDeleteFiles((e) => {
                for (const f of e.files) {
                    this.fileCache.delete(f.fsPath);
                }
            });
        } catch {
            // Ignore when running outside extension host
        }
    }

    /**
     * Executes unified search across filename, symbol, and keyword strategies.
     */
    public async search(searchQuery: SearchQuery): Promise<SearchResult[]> {
        const { query, type = 'all', languages, maxResults = 50 } = searchQuery;
        const trimmed = query.trim();

        if (!trimmed) {
            return [];
        }

        Logger.info(`[SearchService] Executing search query: "${trimmed}" (type: ${type})`);

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const allResults: SearchResult[] = [];

        for (const folder of workspaceFolders) {
            const files = await this.collectFiles(folder.uri.fsPath, languages);

            for (const file of files) {
                const fileName = path.basename(file.path);
                const fileLang = this.detectLanguage(fileName);

                // 1. Filename Search
                if (type === 'all' || type === 'filename') {
                    const fnScore = this.scoreFilenameMatch(fileName, trimmed);
                    if (fnScore > 0) {
                        allResults.push({
                            filePath: file.path,
                            fileName,
                            matchType: 'filename',
                            matchedText: fileName,
                            score: fnScore,
                            languageId: fileLang
                        });
                    }
                }

                // Skip reading file content if only filename search requested
                if (type === 'filename') {
                    continue;
                }

                // Read cached or fresh file content for Symbol & Keyword searches
                const fileContent = await this.getFileContentCached(file.path);
                if (!fileContent) {
                    continue;
                }

                const lines = fileContent.split('\n');

                // 2. Symbol Search
                if ((type === 'all' || type === 'symbol') && fileLang) {
                    const symbolResults = this.searchSymbolsInContent(
                        file.path,
                        fileName,
                        fileContent,
                        lines,
                        fileLang as SupportedLanguage,
                        trimmed
                    );
                    allResults.push(...symbolResults);
                }

                // 3. Keyword / Text Search
                if (type === 'all' || type === 'keyword') {
                    const keywordResults = this.searchKeywordsInContent(
                        file.path,
                        fileName,
                        lines,
                        trimmed,
                        fileLang
                    );
                    allResults.push(...keywordResults);
                }
            }
        }

        // Sort by score descending and deduplicate
        const deduplicated = this.deduplicateAndRank(allResults);
        return deduplicated.slice(0, maxResults);
    }

    private async getFileContentCached(filePath: string): Promise<string | undefined> {
        try {
            const stat = await fs.promises.stat(filePath);
            const cached = this.fileCache.get(filePath);

            if (cached && cached.mtimeMs === stat.mtimeMs) {
                return cached.content;
            }

            const content = await fs.promises.readFile(filePath, 'utf-8');
            this.fileCache.set(filePath, { content, mtimeMs: stat.mtimeMs });
            return content;
        } catch {
            return undefined;
        }
    }

    public async searchFilename(pattern: string, maxResults: number = 50): Promise<SearchResult[]> {
        return this.search({ query: pattern, type: 'filename', maxResults });
    }

    public async searchSymbol(
        symbolName: string,
        languages?: SupportedLanguage[],
        maxResults: number = 50
    ): Promise<SearchResult[]> {
        return this.search({ query: symbolName, type: 'symbol', languages, maxResults });
    }

    public async searchKeyword(keyword: string, maxResults: number = 50): Promise<SearchResult[]> {
        return this.search({ query: keyword, type: 'keyword', maxResults });
    }

    /**
     * Traverses files in workspace directory respecting ignore filters.
     */
    private async collectFiles(
        dirPath: string,
        filterLanguages?: SupportedLanguage[]
    ): Promise<{ path: string }[]> {
        const fileList: { path: string }[] = [];

        const readDir = async (currentDir: string, depth: number) => {
            if (depth > 10) return;

            let entries: fs.Dirent[];
            try {
                entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                if (this.defaultIgnoredDirectories.has(entry.name) || this.defaultIgnoredFiles.has(entry.name)) {
                    continue;
                }

                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    await readDir(fullPath, depth + 1);
                } else if (entry.isFile()) {
                    const lang = this.detectLanguage(entry.name);
                    if (!filterLanguages || (lang && filterLanguages.includes(lang as SupportedLanguage))) {
                        fileList.push({ path: fullPath });
                    }
                }
            }
        };

        await readDir(dirPath, 0);
        return fileList;
    }

    /**
     * Matches code symbols in file content using language patterns.
     */
    private searchSymbolsInContent(
        filePath: string,
        fileName: string,
        content: string,
        lines: string[],
        language: SupportedLanguage,
        query: string
    ): SearchResult[] {
        const results: SearchResult[] = [];
        const patterns = this.symbolPatterns[language] || [];
        const lowerQuery = query.toLowerCase();

        for (const pattern of patterns) {
            pattern.lastIndex = 0; // Reset regex state
            let match: RegExpExecArray | null;

            while ((match = pattern.exec(content)) !== null) {
                const symbolName = match[1] || match[0];
                if (!symbolName) continue;

                const lowerSymbol = symbolName.toLowerCase();
                if (lowerSymbol.includes(lowerQuery)) {
                    const lineNum = content.substring(0, match.index).split('\n').length;
                    const lineSnippet = lines[lineNum - 1]?.trim() || '';

                    let score = 75;
                    if (lowerSymbol === lowerQuery) {
                        score = 100; // Exact match
                    } else if (lowerSymbol.startsWith(lowerQuery)) {
                        score = 85; // Prefix match
                    }

                    results.push({
                        filePath,
                        fileName,
                        lineNumber: lineNum,
                        matchType: 'symbol',
                        matchedText: symbolName,
                        lineSnippet,
                        score,
                        languageId: language
                    });
                }
            }
        }

        return results;
    }

    /**
     * Searches for occurrences of keyword in file lines.
     */
    private searchKeywordsInContent(
        filePath: string,
        fileName: string,
        lines: string[],
        query: string,
        languageId?: string
    ): SearchResult[] {
        const results: SearchResult[] = [];
        const lowerQuery = query.toLowerCase();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();

            if (lowerLine.includes(lowerQuery)) {
                let score = 45;
                if (lowerLine.trim().startsWith(lowerQuery)) {
                    score = 60;
                }

                results.push({
                    filePath,
                    fileName,
                    lineNumber: i + 1,
                    matchType: 'keyword',
                    matchedText: query,
                    lineSnippet: line.trim(),
                    score,
                    languageId
                });

                if (results.length >= 10) break; // Limit keyword matches per file
            }
        }

        return results;
    }

    /**
     * Calculates score for filename match.
     */
    private scoreFilenameMatch(fileName: string, query: string): number {
        const lowerName = fileName.toLowerCase();
        const lowerQuery = query.toLowerCase();

        if (lowerName === lowerQuery) return 95;
        if (lowerName.startsWith(lowerQuery)) return 80;
        if (lowerName.includes(lowerQuery)) return 65;
        return 0;
    }

    /**
     * Map file extension to supported language ID.
     */
    private detectLanguage(fileName: string): string | undefined {
        const ext = path.extname(fileName).toLowerCase();
        switch (ext) {
            case '.ts':
            case '.tsx':
                return 'typescript';
            case '.js':
            case '.jsx':
                return 'javascript';
            case '.py':
                return 'python';
            case '.java':
                return 'java';
            case '.cpp':
            case '.cxx':
            case '.cc':
            case '.hpp':
            case '.h':
                return 'cpp';
            case '.c':
                return 'c';
            default:
                return undefined;
        }
    }

    /**
     * Deduplicates search results and ranks by score descending.
     */
    private deduplicateAndRank(results: SearchResult[]): SearchResult[] {
        const uniqueMap = new Map<string, SearchResult>();

        for (const res of results) {
            const key = `${res.filePath}:${res.lineNumber || 0}:${res.matchType}:${res.matchedText}`;
            const existing = uniqueMap.get(key);
            if (!existing || existing.score < res.score) {
                uniqueMap.set(key, res);
            }
        }

        return Array.from(uniqueMap.values()).sort((a, b) => b.score - a.score);
    }
}
