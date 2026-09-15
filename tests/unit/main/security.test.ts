import { describe, expect, it } from 'vitest';
import { isExternalWebUrl, isInternalNavigation } from '../../../src/main/security';

describe('isExternalWebUrl', () => {
    it('accepts http and https only', () => {
        expect(isExternalWebUrl('https://example.com/docs')).toBe(true);
        expect(isExternalWebUrl('http://localhost:8080')).toBe(true);
    });

    it('rejects every other scheme and malformed input', () => {
        for (const url of [
            'file:///etc/passwd',
            'javascript:alert(1)',
            'kubermeister://open',
            'ftp://x',
            'not a url',
            '',
        ]) {
            expect(isExternalWebUrl(url)).toBe(false);
        }
    });
});

describe('isInternalNavigation', () => {
    it('allows only the dev server origin while developing', () => {
        const dev = 'http://localhost:5173/';
        expect(isInternalNavigation('http://localhost:5173/#/pods', dev)).toBe(true);
        expect(isInternalNavigation('http://localhost:5174/', dev)).toBe(false);
        expect(isInternalNavigation('https://example.com', dev)).toBe(false);
        expect(isInternalNavigation('file:///app/index.html', dev)).toBe(false);
    });

    it('allows only the packaged file bundle otherwise', () => {
        expect(
            isInternalNavigation('file:///Applications/Kubermeister.app/Contents/Resources/app/index.html', undefined),
        ).toBe(true);
        expect(isInternalNavigation('http://localhost:5173/', undefined)).toBe(false);
        expect(isInternalNavigation('https://example.com', undefined)).toBe(false);
    });
});
