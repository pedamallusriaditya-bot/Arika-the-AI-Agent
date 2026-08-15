import * as vscode from 'vscode';
import * as path from 'path';
import { CurrentFileContext } from './AIService';

export interface IEditorContextService {
    getActiveFileContext(): CurrentFileContext | undefined;
    getSelectedText(): { text: string; languageId: string } | undefined;
}

export class EditorContextService implements IEditorContextService {
    /**
     * Safely reads and formats active document details.
     */
    public getActiveFileContext(): CurrentFileContext | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const document = editor.document;
        return {
            fileName: path.basename(document.fileName),
            languageId: document.languageId,
            content: document.getText(),
            filePath: document.fileName
        };
    }

    /**
     * Retrieves highlighted selection text if present.
     */
    public getSelectedText(): { text: string; languageId: string } | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();

        if (!selectedText) {
            return undefined;
        }

        return {
            text: selectedText,
            languageId: editor.document.languageId
        };
    }
}
