/**
 * What the renderer needs to know about releases without asking the network: which channel a
 * version belongs to and where its release page lives. Tip builds are versioned
 * `<next stable>-tip.<build>`, so the prerelease tag is the channel.
 */

export const REPOSITORY_URL = 'https://github.com/kubermeister/kubermeister';

export type UpdateChannel = 'stable' | 'tip';

export function channelOfVersion(version: string): UpdateChannel {
    return /-tip(\.|$)/.test(version) ? 'tip' : 'stable';
}

/** The GitHub release page for a version: the rolling tip release, or the `vX.Y.Z` tag. */
export function releasePageUrl(version: string): string {
    return channelOfVersion(version) === 'tip'
        ? `${REPOSITORY_URL}/releases/tag/tip`
        : `${REPOSITORY_URL}/releases/tag/v${version}`;
}
