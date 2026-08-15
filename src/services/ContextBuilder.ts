import { CurrentFileContext } from './AIService';
import { WorkspaceScanResult } from './WorkspaceScanner';

/**
 * Consolidates all workspace and user input context sources.
 */
export interface ContextInput {
    userQuestion: string;
    activeFile?: CurrentFileContext;
    selectedCode?: string;
    projectTree?: WorkspaceScanResult[];
    customMetadata?: Record<string, unknown>;
}

/**
 * Budgeting and formatting constraints for context building.
 */
export interface ContextBuilderOptions {
    /**
     * Maximum character budget for combined user prompt (default: 16,000 chars ~4,000 tokens).
     */
    maxCharacterBudget?: number;
    /**
     * Maximum characters allocated for active file contents before truncation (default: 6,000 chars).
     */
    maxFileContentLength?: number;
    /**
     * Whether to format and include project tree hierarchy (default: true).
     */
    includeProjectTree?: boolean;
}

/**
 * Decoupled output payload ready for AI Chat Completions.
 */
export interface OptimizedPromptPayload {
    systemPrompt: string;
    userPrompt: string;
    characterCount: number;
}

/**
 * Extensible strategy provider interface for individual context sections.
 */
export interface IContextSectionProvider {
    name: string;
    priority: number; // Lower priority numbers render earlier in the prompt
    buildSection(input: ContextInput, options: ContextBuilderOptions): string | undefined;
}

/**
 * Service contract for the ContextBuilder.
 */
export interface IContextBuilder {
    buildOptimizedPrompt(input: ContextInput, options?: ContextBuilderOptions): OptimizedPromptPayload;
    registerSectionProvider(provider: IContextSectionProvider): void;
}

// Default Section Providers

export class UserQuestionSectionProvider implements IContextSectionProvider {
    public readonly name = 'UserQuestion';
    public readonly priority = 1;

    public buildSection(input: ContextInput): string | undefined {
        if (!input.userQuestion.trim()) {
            return undefined;
        }
        return `### User Query\n${input.userQuestion.trim()}`;
    }
}

export class SelectedCodeSectionProvider implements IContextSectionProvider {
    public readonly name = 'SelectedCode';
    public readonly priority = 2;

    public buildSection(input: ContextInput): string | undefined {
        if (!input.selectedCode?.trim()) {
            return undefined;
        }
        const lang = input.activeFile?.languageId || '';
        return `### Highlighted / Selected Code Snippet\n\`\`\`${lang}\n${input.selectedCode.trim()}\n\`\`\``;
    }
}

export class ActiveFileSectionProvider implements IContextSectionProvider {
    public readonly name = 'ActiveFile';
    public readonly priority = 3;

    public buildSection(input: ContextInput, options: ContextBuilderOptions): string | undefined {
        if (!input.activeFile) {
            return undefined;
        }

        const { fileName, languageId, content, filePath } = input.activeFile;
        const maxLen = options.maxFileContentLength || 6000;

        let processedContent = content;
        if (content.length > maxLen) {
            const truncatedLines = content.slice(maxLen).split('\n').length;
            processedContent = `${content.slice(0, maxLen)}\n\n[... truncated ${truncatedLines} trailing lines for token budget optimization ...]`;
        }

        return `### Active File Context (\`${fileName}\`)
- **File Name**: \`${fileName}\`
- **Language**: \`${languageId}\`
- **Path**: \`${filePath || 'N/A'}\`

\`\`\`${languageId}
${processedContent}
\`\`\``;
    }
}

export class ProjectTreeSectionProvider implements IContextSectionProvider {
    public readonly name = 'ProjectTree';
    public readonly priority = 4;

    public buildSection(input: ContextInput, options: ContextBuilderOptions): string | undefined {
        if (options.includeProjectTree === false || !input.projectTree || input.projectTree.length === 0) {
            return undefined;
        }

        let asciiTree = '';
        for (const rootResult of input.projectTree) {
            asciiTree += `📁 ${rootResult.rootName}/\n`;
            for (const node of rootResult.tree) {
                asciiTree += this.formatNode(node, '  ');
            }
        }

        return `### Workspace Project Structure\n\`\`\`text\n${asciiTree.trim()}\n\`\`\``;
    }

    private formatNode(node: any, indent: string): string {
        let result = '';
        if (node.type === 'directory') {
            result += `${indent}├── 📁 ${node.name}/\n`;
            if (node.children) {
                for (const child of node.children) {
                    result += this.formatNode(child, `${indent}│   `);
                }
            }
        } else {
            result += `${indent}├── 📄 ${node.name}\n`;
        }
        return result;
    }
}

export class ContextBuilder implements IContextBuilder {
    private sectionProviders: IContextSectionProvider[] = [];

    constructor() {
        // Register default providers sorted by priority
        this.registerSectionProvider(new UserQuestionSectionProvider());
        this.registerSectionProvider(new SelectedCodeSectionProvider());
        this.registerSectionProvider(new ActiveFileSectionProvider());
        this.registerSectionProvider(new ProjectTreeSectionProvider());
    }

    /**
     * Registers a new context section provider, maintaining priority order.
     */
    public registerSectionProvider(provider: IContextSectionProvider): void {
        this.sectionProviders.push(provider);
        this.sectionProviders.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Builds decoupled system and user prompts within budget constraints.
     */
    public buildOptimizedPrompt(
        input: ContextInput,
        options: ContextBuilderOptions = {}
    ): OptimizedPromptPayload {
        const maxBudget = options.maxCharacterBudget || 16000;

        const systemPrompt = `You are Arika, an elite AI software architecture and coding assistant.
Provide concise, accurate, and context-aware responses. Format code snippets with syntax highlighting.
Always leverage provided workspace file context, selected snippets, and project structure when answering.`;

        const sectionContents: string[] = [];

        for (const provider of this.sectionProviders) {
            const sectionText = provider.buildSection(input, options);
            if (sectionText) {
                sectionContents.push(sectionText);
            }
        }

        let combinedUserPrompt = sectionContents.join('\n\n---\n\n');

        // Prevent context explosion if total character length exceeds budget
        if (combinedUserPrompt.length > maxBudget) {
            combinedUserPrompt = `${combinedUserPrompt.slice(0, maxBudget)}\n\n[... Remaining context omitted to prevent context window overflow ...]`;
        }

        return {
            systemPrompt,
            userPrompt: combinedUserPrompt,
            characterCount: combinedUserPrompt.length
        };
    }
}
