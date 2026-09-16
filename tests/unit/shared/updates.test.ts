import { describe, expect, it } from 'vitest';
import { channelOfVersion, releasePageUrl, REPOSITORY_URL } from '../../../src/shared/updates';

describe('channelOfVersion', () => {
    it('reads the channel from the prerelease tag', () => {
        expect(channelOfVersion('0.2.1')).toBe('stable');
        expect(channelOfVersion('0.2.1-tip.50')).toBe('tip');
        expect(channelOfVersion('1.0.0-tip')).toBe('tip');
    });

    it('does not mistake other prerelease tags or a "tip" elsewhere for the tip channel', () => {
        expect(channelOfVersion('0.2.1-beta.1')).toBe('stable');
        expect(channelOfVersion('0.2.1-tiptop.1')).toBe('stable');
    });
});

describe('releasePageUrl', () => {
    it('points tip builds at the rolling release and stable versions at their tag', () => {
        expect(releasePageUrl('0.2.1-tip.50')).toBe(`${REPOSITORY_URL}/releases/tag/tip`);
        expect(releasePageUrl('0.2.1')).toBe(`${REPOSITORY_URL}/releases/tag/v0.2.1`);
    });
});
