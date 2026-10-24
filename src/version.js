import metadata from '../package.json' with { type: 'json' };

export const RELEASE_VERSION = metadata.version;
