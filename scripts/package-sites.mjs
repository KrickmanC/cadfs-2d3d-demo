import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const projectId = 'appgprj_6a50c7801aac819182af38e52f35abb1'
const buildDir = 'build-static'
let html = await readFile(path.join(buildDir, 'index.html'), 'utf8')
const cssTag = html.match(/<link\s+rel="stylesheet"[^>]+href="([^"]+\.css)"[^>]*>/)
const javascriptTag = html.match(/<script\s+type="module"[^>]+src="([^"]+\.js)"[^>]*><\/script>/)

if (!cssTag?.[1] || !javascriptTag?.[1]) throw new Error('Vite HTML does not contain the expected CSS and JavaScript assets')

const css = await readFile(path.join(buildDir, cssTag[1].replace(/^\//, '')), 'utf8')
const javascript = await readFile(path.join(buildDir, javascriptTag[1].replace(/^\//, '')), 'utf8')
const javascriptDataUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
html = html.replace(cssTag[0], () => `<style>${css}</style>`)
html = html.replace(javascriptTag[0], () => `<script type="module" src="${javascriptDataUrl}"></script>`)
const jsLiteral = (value) => JSON.stringify(value).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')

const worker = `const INDEX_HTML = ${jsLiteral(html)};

function textResponse(body, status = 200, contentType = "text/plain; charset=utf-8") {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return textResponse(INDEX_HTML, 200, "text/html; charset=utf-8");
    }
    if (url.pathname === "/cadfs-paper.pdf") {
      return Response.redirect("https://voyleg.github.io/cadfs/", 302);
    }
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    return textResponse("Not found", 404);
  },
};
`

await rm('dist', { recursive: true, force: true })
await mkdir('dist/server', { recursive: true })
await mkdir('dist/client', { recursive: true })
await mkdir('dist/_appgen_meta', { recursive: true })
await mkdir('dist/.openai', { recursive: true })
await writeFile('dist/server/index.js', worker, 'utf8')
await writeFile('dist/client/index.html', html, 'utf8')
await writeFile('dist/_appgen_meta/appgarden.json', JSON.stringify({ project_id: projectId }, null, 2), 'utf8')
await writeFile('dist/.openai/hosting.json', JSON.stringify({ project_id: projectId }, null, 2), 'utf8')

console.log(`Sites package ready: ${(Buffer.byteLength(worker) / 1024 / 1024).toFixed(2)} MiB worker`)
