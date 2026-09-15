import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks the layout and pointer APIs the Radix and cmdk primitives call when they open.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

// CodeMirror measures its document through Range geometry, which jsdom does not implement.
const emptyRectList = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as DOMRectList;
Range.prototype.getClientRects ??= emptyRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

afterEach(() => cleanup());
