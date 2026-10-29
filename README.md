# Image Scout

Self-hosted Google Images search for regular ChatGPT Chat. Serper supplies structured Google Images results; this server downloads the actual image bytes, sends them to ChatGPT as MCP image blocks, and displays selected copies in an in-chat viewer. ChatGPT is instructed to choose by looking at pixels, not filenames, captions, tags, or URLs.

Start with [SETUP.md](SETUP.md).

## Why Serper

Direct Google HTML scraping can trigger Google human-verification pages. The default provider is Serper, a third-party Google SERP API that handles Google access and returns structured image results. Serper advertises 2,500 free queries with no credit card; treat this as the provider's free allocation, not unlimited recurring access. A Serper API key is required.

The old direct Google modes remain available for compatibility:

- `SEARCH_PROVIDER=google`, `GOOGLE_MODE=html`: no-key HTML parsing, but CAPTCHA-prone.
- `SEARCH_PROVIDER=google`, `GOOGLE_MODE=api`: official Google API mode, requiring `GOOGLE_API_KEY` and `GOOGLE_CSE_ID`.

## What happens

1. Serper asks Google Images for candidates for your term.
2. This server downloads each candidate image and sends its pixels to ChatGPT.
3. Candidate IDs are neutral during selection; source URLs and links stay hidden until a candidate is chosen.
4. `show_images` displays downloaded bytes in the chat viewer. It does not depend on Python networking or an external Markdown image embed.
5. `get_image_links` returns the original-image and source-page links after visual selection.

The viewer can offer device download and “Save to ChatGPT” controls when the ChatGPT client exposes those APIs. An MCP image block by itself does not automatically create a native chat attachment or a Python file.

This is for regular Chat, not ChatGPT Work. It needs a public HTTPS MCP endpoint and an account/workspace that allows custom MCP connections. The server needs Node.js and outbound HTTPS; it does not need an OpenAI API key or Python internet access.

## Quick start

```bash
npm ci
npm run setup
npm start
```

Add your Serper key to `.env`:

```env
SEARCH_PROVIDER=serper
SERPER_API_KEY=your_serper_key
```

For a local smoke check:

```bash
npm test
npm run smoke
npm run smoke -- --search "blue butterfly"
```

ChatGPT's cloud cannot normally reach `localhost`, so use Render, another HTTPS host, or a supported tunnel. See [SETUP.md](SETUP.md).

## Environment variables

| Variable | Meaning |
| --- | --- |
| `MCP_SECRET` | Required random password, 32–512 characters. |
| `SEARCH_PROVIDER` | Defaults to `serper`; `serper`, `google`, `brave`, and `wikimedia` are supported. |
| `SERPER_API_KEY` | Required when `SEARCH_PROVIDER=serper`. Keep it private. |
| `GOOGLE_MODE` | Direct Google compatibility mode: `html` or `api`. |
| `GOOGLE_API_KEY` | Required only for direct Google API mode. |
| `GOOGLE_CSE_ID` | Required only for direct Google API mode. |
| `BRAVE_API_KEY` | Used only if `SEARCH_PROVIDER=brave`. |
| `PORT` | Listening port, default `9000`. |
| `HOST` | Listening address, default `0.0.0.0`. |
| `PUBLIC_BASE_URL` | Public HTTPS origin, such as `https://images.example.com`. |
| `OUTBOUND_USER_AGENT` | Optional identification for outbound requests. |

Never upload `.env`, a real key, or the private MCP connection URL. The URL contains a bearer token.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `vision_self_test` | Tests whether the model receives image pixels and opens the in-chat viewer. |
| `check_image_vision` | Verifies the random code read from the self-test image. |
| `search_images` | Searches Google through Serper and supplies downloaded candidate pixels. |
| `inspect_image` | Supplies a larger downloaded copy of one candidate. |
| `show_images` | Displays one to four selected downloaded copies in the chat viewer. |
| `get_image_links` | Returns original-image and source-page links after selection. |

One `search_images` call uses one Serper search request. `inspect_image`, `show_images`, and `get_image_links` do not consume additional Serper search quota. Image downloads come directly from the original image hosts and can still fail if a host blocks the server.

The server resizes images, strips EXIF metadata, rejects unsupported formats, limits downloads, blocks private/reserved addresses, and keeps candidates only in memory. A restart clears candidates. Search results may expire after 30 minutes.

## First ChatGPT check

After connecting the MCP URL in regular Chat, start a new chat and run:

> Run `vision_self_test`, read the six-digit code from the image, and call `check_image_vision`. Also tell me whether I can see the test picture.

Continue only if the code check passes and you can see the picture. Then try:

> Search Google Images for “black cat looking left”. Look directly at the pictures, choose a match, display it with `show_images`, and give me its source link. Do not choose using filenames, captions, tags, or URLs.

## Troubleshooting

| Problem | Meaning / fix |
| --- | --- |
| Serper key error | Add `SERPER_API_KEY` to the host environment and redeploy/restart. |
| Serper quota error | Check the Serper account's remaining free credits or wait until the quota resets if applicable. |
| Images found but none display | Source hosts rejected the server download; try another term. |
| Self-test fails | Refresh the MCP connection and start a new regular Chat. The client must support MCP image content and MCP Apps UI. |
| Save button is missing | The client did not expose its upload API; the viewer can still show the bytes. |
| Connection fails | Use the exact HTTPS MCP URL built by the homepage and keep its token private. |

## Security and rights

Search terms are sent to Serper. The server does not expose Serper metadata to the model during visual selection, but it receives source URLs internally to download images. It blocks non-HTTP(S) URLs, private/reserved IPs, unsafe redirects, unusual ports, and oversized responses. Image search results do not grant reuse rights; use the source-page link to check licensing and context.

## References

- [Serper](https://serper.dev/)
- [SerpApi Google Images result fields](https://serpapi.com/images-results)
- [MCP SDK image results](https://ts.sdk.modelcontextprotocol.io/server#image-and-audio-results)
- [MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui)
- [OpenAI Data Analysis networking constraint](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt)
