# Image Scout

Self-hosted image search for **regular ChatGPT Chat**. It searches for existing pictures, sends their actual pixels to ChatGPT, and gives you original-image and source-page links after visual selection.

**Start here:** [SETUP.md](SETUP.md) has the short hosting and connection steps.

## What it does

1. An external search provider finds candidates for your term.
2. This server downloads the real image files and sends MCP `image` content blocks, containing image bytes, to ChatGPT. It does not just return URLs.
3. ChatGPT sees numbered-by-ID candidates without filenames, captions, tags, or source URLs. ChatGPT chooses by looking at the images; the server itself does not judge the match.
4. ChatGPT can request a larger view of a candidate, then obtain its original-image and source-page links.

The search provider still uses its own index to *find candidates*. The visual-selection step is the part intended to depend on pixels.

**Client compatibility must be checked after hosting.** This implementation uses the official MCP SDK and standard image results. It cannot force a ChatGPT model or account to expose or correctly interpret those images. Run the included visual self-test in your actual regular Chat before relying on it. The server can deliver pixels; only the ChatGPT client determines whether its model sees them. There is no metadata-only fallback that pretends to be visual analysis.

No ChatGPT Work, OpenAI API key, external vision model, database, or Python internet access is needed by this server. Hosting, search-provider usage, and ChatGPT account access are separate.

## Search providers

| Mode | Searches | What you need |
| --- | --- | --- |
| `brave` | Broad web image index | A Brave Search API key with image-search access |
| `wikimedia` | Wikimedia Commons only | No API key; fewer kinds of images |

The Render template and `npm run setup` select Wikimedia so a first trial can run without a key. For broad web search, set `SEARCH_PROVIDER=brave` and add `BRAVE_API_KEY`. Restart after changing configuration. There is no silent provider fallback. Brave requests use strict Safe Search.

## Local run

Install Node.js **22.16+** or 24, then open a terminal in this folder:

```bash
npm ci
npm run setup
npm start
```

Open <http://localhost:9000>. The setup script creates a private `.env` with a random secret; it never overwrites an existing `.env`. For broad web search, put your key in `.env` and set `SEARCH_PROVIDER=brave`.

In another terminal:

```bash
npm test
npm run smoke
npm run smoke -- --search "blue butterfly"
```

The smoke command tests a real MCP connection and image transport, not ChatGPT's visual interpretation. The optional `--search` command contacts your configured search provider.

ChatGPT needs a public HTTPS address or a supported private MCP tunnel. A localhost address alone is not reachable from ChatGPT's cloud. Hosting steps are in [SETUP.md](SETUP.md).

## Docker / your own server

Create `.env` with `npm run setup`, or copy `.env.example` and replace the example secret with a long random one. Then:

```bash
docker compose up --build -d
```

This binds port 9000 to the host's loopback interface. Put it behind an HTTPS reverse proxy and set `PUBLIC_BASE_URL` to your HTTPS origin. `Caddyfile.example` shows a minimal Caddy configuration. On a managed Docker host, use the `Dockerfile`, inject the environment variables, and let the host provide HTTPS and the public port.

Run one application instance. Candidate images and self-test challenges are cached in memory. Multiple replicas would need a shared cache; a restart clears candidates, so search again after restarting. Nothing is written to disk by the running server.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `MCP_SECRET` | Required random password, 32–512 characters. Render generates it automatically. |
| `SEARCH_PROVIDER` | `brave` or `wikimedia`. If unset, Brave when a key is present, otherwise Wikimedia. |
| `BRAVE_API_KEY` | Your Brave key. Required only in Brave mode. |
| `PORT` | Port to listen on; default `9000`. |
| `HOST` | Listen address; default `0.0.0.0`. |
| `PUBLIC_BASE_URL` | Public HTTPS origin, such as `https://images.example.com`. Render's `RENDER_EXTERNAL_URL` is used automatically if this is unset. |
| `OUTBOUND_USER_AGENT` | Optional identification for remote requests. Include your site or contact URL when using Wikimedia. |

Never put `.env`, a real key, or the private MCP connection URL in a public repository. The connection URL is a bearer secret: anyone with it can use your server and search quota. The homepage calculates its token with SHA-256 in your browser. It does not send or store your pasted `MCP_SECRET`. A hash used in this URL is itself an access credential, not a public identifier.

This personal-server design uses a secret URL, not an OAuth login. In ChatGPT, select **No authentication** because access is checked by the URL token. If your workspace requires OAuth, this package will need an OAuth integration; do not make the endpoint public to work around that requirement. A hosting provider or reverse proxy can record URL paths: configure its logging appropriately and keep access to logs private. The app itself does not log request paths or search terms.

## Tools

| Tool | Result |
| --- | --- |
| `vision_self_test` | An image of a fresh random six-digit code, with no answer in metadata. |
| `check_image_vision` | Checks the code the model read. Three attempts, ten-minute expiry. |
| `search_images` | Up to ten actual candidate image payloads; six by default. |
| `inspect_image` | Original image resized to at most 1600 pixels per side, or an explicitly labeled preview fallback. |
| `get_image_links` | Original image, source page, and thumbnail links for supplied candidate IDs. |

Previews are resized without cropping, converted to JPEG, and stripped of EXIF metadata. Large, unavailable, unsupported, or invalid images are skipped. A preview's small details may be unclear: ask for `inspect_image` before trusting them. Animated files use the first frame. Candidate IDs last up to 30 minutes, subject to the cache's 32 MiB / 160-entry limits.

Inline display depends on ChatGPT's renderer and the source website allowing image access. The final answer should always include links even when an inline image works. Image hosting or search inclusion does not grant reuse rights; the source page is provided so you can check the original context.

The service blocks non-HTTP(S) URLs, private/reserved IPs, unusual ports, unsafe redirects, and DNS changes to internal addresses at connection time. Downloads and image dimensions are bounded. Requests and simultaneous image processing are limited. This is intended as a personal service, not a public multi-user gateway.

## Troubleshooting

| What happens | What to do |
| --- | --- |
| ChatGPT cannot add a custom server | Check whether your plan/workspace allows custom MCP tools; this code cannot enable that account feature. |
| Connection fails / 404 | Use the exact URL built by your service homepage with the current `MCP_SECRET`. Use HTTPS. After rotating the secret, rebuild the URL and update the connection. |
| Opening the MCP URL in a browser returns 405 | Expected. MCP clients POST to it; the human setup page is the service homepage. |
| Self-test fails | Try a fresh test. If ChatGPT cannot see the image blocks, do not treat any later answer as visually verified. Check client/model support. |
| Brave rejects a request | Check the key, image-search permissions, quota, and language/country values. |
| No pictures load | Source hosts may block downloads; try another term/provider. Wikimedia has a narrower catalog. |
| Candidate is unknown | It expired, was evicted, or the server restarted. Run the search again. |
| Free host is asleep | Open the service homepage, wait for it to start, then reconnect. For frequent use, choose an appropriate hosting plan. |
| Host rejected / 403 | Set `PUBLIC_BASE_URL` to the actual external origin, and preserve the original Host header in your reverse proxy. |

## How this was checked

The automated tests cover the official SDK's HTTP handshake, discovery, image blocks, pixel decoding, the code challenge, search-to-links flow, withheld URLs/captions, download failures, access controls, size limits, and public-address checks. See [TEST-RESULTS.md](TEST-RESULTS.md) for the actual verification run and its limits.

## Primary documentation

- [MCP SDK: image results](https://ts.sdk.modelcontextprotocol.io/server#image-and-audio-results)
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [OpenAI: connect a custom MCP server](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [OpenAI: plugins in regular Chat](https://learn.chatgpt.com/docs/plugins)
- [Brave image-search API](https://api-dashboard.search.brave.com/api-reference/images/image_search)
- [MediaWiki image information](https://www.mediawiki.org/wiki/API:Imageinfo)
- [Render deployment template fields](https://render.com/docs/blueprint-spec)

## Project files

`src/` contains the server and tools; `public/` is the connection helper page; `scripts/` contains setup and smoke checks; `test/` contains automated tests. `Dockerfile`, `compose.yaml`, and `render.yaml` are hosting options. `package-lock.json` pins the tested dependency tree.
