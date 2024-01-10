import { get404, daResp, getRobots } from './responses';

export default {
  async fetch(req) {
    const { pathname, searchParams } = new URL(req.url);

    if (pathname === '/favicon.ico') return get404();
    if (pathname === '/robots.txt') return getRobots();

    const url = searchParams.get('sitemap') || 'https://danaher.com/sitemap.xml';

    async function gatherResponse(response) {
      const { headers, status } = response;
      const contentType = headers.get('content-type') || '';
      const body = await response.text();
      return daResp({ body, contentType, status });
    }

    const init = {
      headers: {
        'content-type': 'text/html;charset=UTF-8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    const response = await fetch(url, init);
    return gatherResponse(response);
  },
};