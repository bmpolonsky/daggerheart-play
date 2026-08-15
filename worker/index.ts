interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const PAGES_ASSET_ORIGIN = 'https://bmpolonsky.github.io/daggerheart-play';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && (request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/image/')) {
      return Response.redirect(`${PAGES_ASSET_ORIGIN}${url.pathname}${url.search}`, 307);
    }
    if (asset.status !== 404 || request.method !== 'GET' && request.method !== 'HEAD') return asset;
    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  }
};
