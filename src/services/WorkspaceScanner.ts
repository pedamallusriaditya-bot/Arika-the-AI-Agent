import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

/**
 * Hierarchical tree node representing a file or directory in the workspace.
 */
export interface WorkspaceNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    extension?: string;
    children?: WorkspaceNode[];
}

/**
 * Scan summary for a single workspace root folder.
 */
export interface WorkspaceScanResult {
    rootName: string;
    rootPath: string;
    totalFiles: number;
    totalDirectories: number;
    tree: WorkspaceNode[];
}

/**
 * Interface contract for the WorkspaceScanner service.
 */
export interface IWorkspaceScanner {
    scan(maxDepth?: number, maxFiles?: number): Promise<WorkspaceScanResult[]>;
    scanAsJson(maxDepth?: number, maxFiles?: number): Promise<string>;
    getIgnoredDirectories(): string[];
}

export class WorkspaceScanner implements IWorkspaceScanner {
    private readonly defaultIgnoredDirectories: Set<string> = new Set([
        'node_modules',
        '.git',
        'dist',
        'build',
        'out',
        '.vscode',
        '.next',
        '.DS_Store',
        'coverage',
        'tmp',
        'temp'
    ]);

    /**
     * Returns the list of directories ignored during scanning.
     */
    public getIgnoredDirectories(): string[] {
        return Array.from(this.defaultIgnoredDirectories);
    }

    /**
     * Scans all open workspace folders in VS Code.
     * @param maxDepth Maximum recursion depth (default: 8).
     * @param maxFiles Maximum files to scan per root folder (default: 5000).
     */
    public async scan(maxDepth: number = 8, maxFiles: number = 5000): Promise<WorkspaceScanResult[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            Logger.warn('[WorkspaceScanner] No workspace folders are currently open.');
            return [];
        }

        const results: WorkspaceScanResult[] = [];

        for (const folder of workspaceFolders) {
            const rootPath = folder.uri.fsPath;
            Logger.info(`[WorkspaceScanner] Starting scan for workspace root: ${rootPath}`);

            let fileCount = 0;
            let dirCount = 0;

            const tree = await this.scanDirectory(
                rootPath,
                0,
                maxDepth,
                maxFiles,
                () => ++fileCount,
                () => ++dirCount
            );

            results.push({
                rootName: folder.name,
                rootPath,
                totalFiles: fileCount,
                totalDirectories: dirCount,
                tree
            });

            Logger.info(`[WorkspaceScanner] Completed scan for [${folder.name}]: ${fileCount} files, ${dirCount} directories.`);
        }

        return results;
    }

    /**
     * Scans all open workspace folders and returns formatted JSON output.
     */
    public async scanAsJson(maxDepth: number = 8, maxFiles: number = 5000): Promise<string> {
        const results = await this.scan(maxDepth, maxFiles);
        return JSON.stringify(results, null, 2);
    }

    /**
     * Recursively traverses directory entries using fast Dirent streaming.
     */
    private async scanDirectory(
        dirPath: string,
        currentDepth: number,
        maxDepth: number,
        maxFiles: number,
        onFileFound: () => number,
        onDirFound: () => number
    ): Promise<WorkspaceNode[]> {
        if (currentDepth > maxDepth) {
            return [];
        }

        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch (error) {
            Logger.error(`[WorkspaceScanner] Error reading directory: ${dirPath}`, error);
            return [];
        }

        const nodes: WorkspaceNode[] = [];

        for (const entry of entries) {
            const entryName = entry.name;

            // Skip ignored directories & system hidden files
            if (this.defaultIgnoredDirectories.has(entryName)) {
                continue;
            }

            const fullPath = path.join(dirPath, entryName);

            if (entry.isDirectory()) {
                const currentDirCount = onDirFound();
                if (currentDirCount > maxFiles) {
                    Logger.warn(`[WorkspaceScanner] Reached max entries limit (${maxFiles}) at ${dirPath}`);
                    break;
                }

                const children = await this.scanDirectory(
                    fullPath,
                    currentDepth + 1,
                    maxDepth,
                    maxFiles,
                    onFileFound,
                    onDirFound
                );

                nodes.push({
                    name: entryName,
                    path: fullPath,
                    type: 'directory',
                    children
                });
            } else if (entry.isFile()) {
                const currentFileCount = onFileFound();
                if (currentFileCount > maxFiles) {
                    Logger.warn(`[WorkspaceScanner] Reached max files limit (${maxFiles}) at ${dirPath}`);
                    break;
                }

                const ext = path.extname(entryName).toLowerCase();
                let fileSize: number | undefined;

                try {
                    const stats = await fs.promises.stat(fullPath);
                    fileSize = stats.size;
                } catch {
                    // Ignore stat errors for symlinks or locked files
                }

                nodes.push({
                    name: entryName,
                    path: fullPath,
                    type: 'file',
                    size: fileSize,
                    extension: ext || undefined
                });
            }
        }

        // Sort directories first, then files alphabetically
        return nodes.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'directory' ? -1 : 1;
        });
    }
}
