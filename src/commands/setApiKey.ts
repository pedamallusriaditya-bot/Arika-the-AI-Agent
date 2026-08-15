import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export class SetApiKeyCommand {
    public static readonly commandId = 'arika.setApiKey';

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.commands.registerCommand(this.commandId, async () => {
            await this.execute(context);
        });
    }

    private static async execute(context: vscode.ExtensionContext): Promise<void> {
        Logger.info('Executing command: arika.setApiKey');

        const provider = await vscode.window.showQuickPick(
            [
                { label: 'Groq API Key', description: 'GROQ_API_KEY (Meta Llama 3.3 70B - Recommended)', key: 'GROQ_API_KEY' },
                { label: 'Google Gemini API Key', description: 'GEMINI_API_KEY (Gemini 2.0 Flash)', key: 'GEMINI_API_KEY' },
                { label: 'OpenAI API Key', description: 'OPENAI_API_KEY (GPT-4o mini)', key: 'OPENAI_API_KEY' }
            ],
            {
                placeHolder: 'Select the AI Provider to configure API Key for'
            }
        );

        if (!provider) {
            return;
        }

        const apiKey = await vscode.window.showInputBox({
            prompt: `Enter your ${provider.label}`,
            placeHolder: provider.key === 'GEMINI_API_KEY' ? 'AIzaSy...' : provider.key === 'GROQ_API_KEY' ? 'gsk_...' : 'sk-...',
            password: true,
            ignoreFocusOut: true
        });

        if (apiKey === undefined) {
            return;
        }

        const trimmedKey = apiKey.trim();
        if (!trimmedKey) {
            await context.secrets.delete(provider.key);
            vscode.window.showInformationMessage(`Removed ${provider.label} from VS Code SecretStorage.`);
            return;
        }

        if (provider.key === 'GEMINI_API_KEY' && !trimmedKey.startsWith('AIzaSy')) {
            vscode.window.showWarningMessage('Google Gemini API keys typically start with "AIzaSy...". Please verify your key.');
        }

        await context.secrets.store(provider.key, trimmedKey);
        Logger.info(`Successfully saved ${provider.key} to VS Code SecretStorage.`);
        vscode.window.showInformationMessage(`Successfully saved ${provider.label} securely to VS Code SecretStorage!`);
    }
}
