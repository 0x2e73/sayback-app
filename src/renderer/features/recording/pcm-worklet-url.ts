// Bundled as its own file next to the page, so `script-src 'self'` covers it: no `data:` or blob.
import url from './pcm-worklet.ts?worker&url';

export const PCM_WORKLET_URL: string = url;
