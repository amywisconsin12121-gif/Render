# Verification

Version 1.3.0, checked with Node.js 24.22.1.

- `npm test`: **36 passed, 0 failed**.
- JavaScript syntax checks passed for `src/`, `scripts/`, and `test/`.
- The default server starts as `search_provider: serper` and correctly reports `search_ready: false` until `SERPER_API_KEY` is supplied.
- The six-tool MCP smoke test passes against the running default server, including real image bytes, the gallery resource, and the self-test.
- The missing-key search path returns a clear setup error and does not fabricate results.
- Serper adapter tests cover the POST endpoint, JSON body, language/country parameters, private API-key header, original/thumbnail/source fields, unsafe URL rejection, missing-key handling, and empty-result handling.
- The safe network layer now supports bounded JSON POST requests and has a dedicated body/header test.
- Viewer tests continue to cover actual image bytes, no external image URLs, host-mediated download, optional ChatGPT upload, file-ID handling, legacy envelopes, fallback image blocks, and unsafe data rejection.
- `npm audit --omit=dev`: **0 vulnerabilities** after the previous dependency update.
- A live Serper search was not run because no user API key was available. The provider's live network response and quota remain dependent on the user's Serper account.
- Docker was not built because no Docker daemon was available in this workspace.
