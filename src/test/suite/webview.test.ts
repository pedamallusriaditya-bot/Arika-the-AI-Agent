import * as assert from 'assert';
import { WebviewTemplateFactory } from '../../providers/WebviewTemplateFactory';

suite('Webview Template & XSS Safety Test Suite', () => {
    test('Webview Sidebar HTML script parses without syntax errors', () => {
        const html = WebviewTemplateFactory.getSidebarHtml('Test Title');
        assert.ok(html.includes('<!DOCTYPE html>'));

        // Extract script tag contents
        const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
        assert.ok(scriptMatch, 'Webview HTML must contain a <script> block');

        const scriptContent = scriptMatch[1];
        assert.ok(scriptContent.length > 0, '<script> block must not be empty');

        // Test compilation using Function constructor to detect parse-time SyntaxErrors
        assert.doesNotThrow(() => {
            new Function(scriptContent);
        }, 'Webview client-side JavaScript must parse without any SyntaxError');
    });

    test('Webview Panel HTML script parses without syntax errors', () => {
        const html = WebviewTemplateFactory.getPanelHtml('Test Panel');
        assert.ok(html.includes('<!DOCTYPE html>'));

        const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
        assert.ok(scriptMatch, 'Panel Webview HTML must contain a <script> block');

        assert.doesNotThrow(() => {
            new Function(scriptMatch![1]);
        }, 'Panel client-side JavaScript must parse cleanly');
    });
});
