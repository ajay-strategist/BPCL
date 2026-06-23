// Vercel serverless function: GET /api/proxy?url=<image-url>
// CORS proxy that fetches a remote image so html2canvas can use it cleanly.
export default async function handler(req, res) {
  let urlParam = req.query.url;
  if (Array.isArray(urlParam)) urlParam = urlParam[0];
  if (!urlParam) {
    return res.status(400).send('Missing URL parameter');
  }

  try {
    const response = await fetch(urlParam, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).send(`Image proxy error: ${error.message}`);
  }
}
