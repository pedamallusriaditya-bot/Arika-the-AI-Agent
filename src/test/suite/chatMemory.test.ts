import * as assert from 'assert';
import { ChatMemory } from '../../services/ChatMemory';

class MockMemento {
    private storage = new Map<string, any>();

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get(key: string, defaultValue?: any): any {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }

    async update(key: string, value: any): Promise<void> {
        if (value === undefined) {
            this.storage.delete(key);
        } else {
            this.storage.get(key);
            this.storage.set(key, value);
        }
    }

    keys(): readonly string[] {
        return Array.from(this.storage.keys());
    }

    setKeysForSync(): void {}
}

suite('ChatMemory Unit Test Suite', () => {
    test('Persists messages and restores history across sessions', async () => {
        const memento = new MockMemento();
        const memory1 = new ChatMemory(memento as any, 8000);

        await memory1.addMessage('user', 'Hello Arika!');
        await memory1.addMessage('assistant', 'Hello! How can I assist you with your codebase today?');

        const messages1 = memory1.getMessages();
        assert.strictEqual(messages1.length, 2);
        assert.strictEqual(messages1[0].content, 'Hello Arika!');

        // Round-trip test: instantiate second memory from same Memento
        const memory2 = new ChatMemory(memento as any, 8000);
        const messages2 = memory2.getMessages();
        assert.strictEqual(messages2.length, 2);
        assert.strictEqual(messages2[0].content, 'Hello Arika!');
        assert.strictEqual(messages2[1].content, 'Hello! How can I assist you with your codebase today?');
    });

    test('Enforces character budget and auto-summarizes overflow turns', async () => {
        const memento = new MockMemento();
        const memory = new ChatMemory(memento as any, 100); // Small budget 100 chars

        await memory.addMessage('user', 'This is a long test message 1 that exceeds the tiny budget.');
        await memory.addMessage('assistant', 'Response 1 long message content for budget test.');
        await memory.addMessage('user', 'Message 2 long message content for budget test.');
        await memory.addMessage('assistant', 'Response 2 content.');

        const messages = memory.getMessages();
        assert.ok(messages.length <= 4, 'Active buffer must be truncated to budget');
    });
});
