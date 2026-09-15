import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from '@/lib/download';

describe('downloadTextFile', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('clicks a temporary anchor pointing at a blob and revokes the URL', () => {
        const createObjectURL = vi.fn(() => 'blob:fake');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            expect(this.href).toBe('blob:fake');
            expect(this.download).toBe('web-1.log');
        });
        downloadTextFile('web-1.log', 'a\nb', 'text/plain');
        expect(createObjectURL).toHaveBeenCalledOnce();
        const blob = createObjectURL.mock.calls[0]![0] as Blob;
        expect(blob.type).toBe('text/plain');
        expect(blob.size).toBe(3);
        expect(click).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });
});
