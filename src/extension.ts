import * as vscode from 'vscode';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AIService } from './services/AIService';
import { WorkspaceScanner } from './services/WorkspaceScanner';
import { ContextBuilder } from './services/ContextBuilder';
import { SearchService } from './services/SearchService';
import { RepoQAService } from './services/RepoQAService';
import { ChatMemory } from './services/ChatMemory';
import { EditorContextService } from './services/EditorContextService';
import { ChatSidebarViewProvider } from './providers/chatSidebarProvider';
import { OpenChatCommand } from './commands/openChat';
import { ExplainSelectionCommand } from './commands/explainSelection';
import { ExplainCurrentFileCommand } from './commands/explainCurrentFile';
import { SetApiKeyCommand } from './commands/setApiKey';
import { Logger } from './utils/logger';

/**
 * Extension Composition Root.
 * Initializes core services, injects dependencies, and wires extension subscriptions.
 */
export function activate(context: vscode.ExtensionContext): void {
    Logger.initialize('Arika');
    Logger.info('Activating Arika Extension v0.0.1...');

    // Load environment variables from .env file located at extension root
    dotenv.config({ path: path.join(context.extensionPath, '.env') });

    try {
        // Initialize core domain services with Dependency Injection & Extension Context
        const aiService = new AIService(context);
        const workspaceScanner = new WorkspaceScanner();
        const contextBuilder = new ContextBuilder();
        const searchService = new SearchService();
        const editorContextService = new EditorContextService();
        const repoQAService = new RepoQAService(aiService, searchService, workspaceScanner, contextBuilder);
        const chatMemory = new ChatMemory(context.workspaceState, 8000);

        Logger.info(`[Extension] Enterprise services ready. Active File: ${editorContextService.getActiveFileContext()?.fileName || 'None'}`);

        // Register Webview Sidebar Provider with injected services
        const sidebarProvider = new ChatSidebarViewProvider(
            context.extensionUri,
            aiService,
            editorContextService,
            repoQAService,
            chatMemory
        );
        const sidebarDisposable = vscode.window.registerWebviewViewProvider(
            ChatSidebarViewProvider.viewType,
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );

        // Register sidebar focus command
        const focusSidebarDisposable = vscode.commands.registerCommand('arika.focusSidebar', () => {
            vscode.commands.executeCommand('arika.sidebarView.focus');
        });

        // Register commands with injected services
        const setApiKeyDisposable = SetApiKeyCommand.register(context);
        const openChatDisposable = OpenChatCommand.register(context, aiService);
        const explainSelectionDisposable = ExplainSelectionCommand.register(context, aiService, editorContextService);
        const explainCurrentFileDisposable = ExplainCurrentFileCommand.register(context, aiService, editorContextService);

        // Wire disposables to extension lifecycle
        context.subscriptions.push(
            sidebarDisposable,
            focusSidebarDisposable,
            setApiKeyDisposable,
            openChatDisposable,
            explainSelectionDisposable,
            explainCurrentFileDisposable
        );

        Logger.info('Arika extension successfully activated! All services and providers initialized.');
    } catch (error) {
        Logger.error('Failed to activate Arika extension', error);
        vscode.window.showErrorMessage('Arika Extension failed to activate. See Output Channel for details.');
    }
}

/**
 * Clean up extension resources on deactivation.
 */
export function deactivate(): void {
    Logger.info('Deactivating Arika Extension...');
    Logger.dispose();
}
