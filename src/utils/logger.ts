import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;

    public static initialize(channelName: string = 'Arika CodeTitan'): void {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel(channelName);
        }
    }

    public static info(message: string): void {
        this.log('INFO', message);
    }

    public static warn(message: string): void {
        this.log('WARN', message);
    }

    public static error(message: string, error?: unknown): void {
        const errorDetails = error instanceof Error ? `: ${error.message}` : '';
        this.log('ERROR', `${message}${errorDetails}`);
        if (error instanceof Error && error.stack) {
            this.outputChannel?.appendLine(error.stack);
        }
    }

    public static show(): void {
        this.outputChannel?.show(true);
    }

    public static dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose();
            this.outputChannel = undefined;
        }
    }

    private static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [${level}] ${message}`;
        if (this.outputChannel) {
            this.outputChannel.appendLine(formatted);
        }
        console.log(formatted);
    }
}
