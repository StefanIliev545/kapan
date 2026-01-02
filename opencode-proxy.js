#!/usr/bin/env node

/**
 * OpenCode WebUI Proxy
 * Fixes missing Content-Type headers for JavaScript/CSS files
 * 
 * Usage: node opencode-proxy.js
 * Then access http://localhost:4097 instead of http://localhost:4096
 */

const http = require('http');
const { URL } = require('url');

const TARGET_PORT = 4096;
const TARGET_HOST = 'localhost';
const PROXY_PORT = 4097;

// MIME type mapping
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(pathname) {
  const ext = pathname.substring(pathname.lastIndexOf('.'));
  return MIME_TYPES[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const targetUrl = `http://${TARGET_HOST}:${TARGET_PORT}${req.url}`;
  const url = new URL(targetUrl);
  
  console.log(`[Proxy] ${req.method} ${req.url} -> ${targetUrl}`);
  
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers },
  };
  
  // Remove host header to avoid issues
  delete options.headers.host;
  
  const proxyReq = http.request(options, (proxyRes) => {
    // Copy status code
    res.statusCode = proxyRes.statusCode;
    
    // Copy headers
    const headers = { ...proxyRes.headers };
    
    // Fix Content-Type for JS/CSS files
    const pathname = url.pathname;
    if (pathname.match(/\.(js|mjs|css)$/i)) {
      const correctMimeType = getMimeType(pathname);
      headers['content-type'] = correctMimeType;
      console.log(`[Proxy] Fixed Content-Type for ${pathname}: ${correctMimeType}`);
    }
    
    // Log errors
    if (proxyRes.statusCode >= 400) {
      let errorBody = '';
      proxyRes.on('data', (chunk) => {
        errorBody += chunk.toString();
      });
      proxyRes.on('end', () => {
        console.error(`[Proxy] Error ${proxyRes.statusCode} for ${req.url}:`);
        try {
          const error = JSON.parse(errorBody);
          console.error(`[Proxy] Error details:`, JSON.stringify(error, null, 2));
        } catch {
          console.error(`[Proxy] Error body:`, errorBody.substring(0, 500));
        }
      });
    }
    
    // Set headers
    Object.keys(headers).forEach(key => {
      res.setHeader(key, headers[key]);
    });
    
    // Pipe response
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error(`[Proxy] Error: ${err.message}`);
    res.statusCode = 502;
    res.end(`Proxy error: ${err.message}`);
  });
  
  // Pipe request body
  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║         OpenCode WebUI Proxy - Running                   ║
╠══════════════════════════════════════════════════════════╣
║  Proxy URL:  http://localhost:${PROXY_PORT}                          ║
║  Target:     http://${TARGET_HOST}:${TARGET_PORT}                      ║
║                                                          ║
║  This proxy fixes missing Content-Type headers           ║
║  Access the web UI at the Proxy URL above               ║
╚══════════════════════════════════════════════════════════╝
  `);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Error] Port ${PROXY_PORT} is already in use.`);
    console.error(`Try: lsof -ti:${PROXY_PORT} | xargs kill -9\n`);
  } else {
    console.error(`[Error] ${err.message}`);
  }
  process.exit(1);
});

