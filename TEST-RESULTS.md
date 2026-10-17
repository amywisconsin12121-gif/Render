# Verification

Version 1.1.0, checked on 17 October 2026 with Node.js 24.19.0.

- `npm test`: **28 passed, 0 failed** using Node's built-in test runner.
- A real HTTP connection using the official MCP SDK client completed initialization, discovered all six tools and the UI resource, received decodable PNG/JPEG image blocks, inspected a candidate, returned selected image bytes through `show_images`, and resolved the original/source links.
- The viewer's actual inline JavaScript ran in jsdom with simulated MCP Apps / ChatGPT host APIs. Tests checked data-image rendering without external URLs, a host-mediated download carrying exact file bytes, optional upload of a real `File`, returned file IDs in image context, unavailable API behavior, upload failure and retry, legacy metadata delivery, native-image-block fallback, and rejection of SVG / HTML title injection. These are DOM and bridge-contract tests, not a browser screenshot or a real ChatGPT upload.
- Search, original downloads, and preview fallbacks used synthetic image files and mocked provider responses. URLs and captions remain withheld during visual selection. The new UI data contains actual image bytes and neutral filenames.
- The visual self-test image was previously received through MCP, opened locally, read visually, and answered correctly. This validates that local verification path, **not regular ChatGPT's client**.
- Size limits, local/private-address blocking, DNS-answer validation, redirects to internal addresses, cache expiry, invalid requests, origin checks, secret-URL access, and request limiting passed.
- JavaScript syntax checks and parsing of the Docker Compose / Render YAML files passed on the original package. The updated viewer JavaScript executes in the new DOM tests.
- The connection helper homepage was checked over HTTP. A full browser run could not be completed because no browser binary is installed in this workspace.
- `npm audit --omit=dev`: **0 known vulnerabilities** at verification time. The dependency lockfile is included. The viewer adds no runtime dependency; jsdom is used only by development tests.
- The update archive excludes `src/providers.js`, secrets, and deployment configuration. The local provider file is unchanged from the original package.

## Still to check after deployment

- This update has not been deployed to your host or refreshed in your ChatGPT connection. Follow [UPDATE.md](UPDATE.md).
- In a new regular Chat, run the self-test: confirm both that the model reads the random code correctly and that **you can see the test picture** in the viewer.
- Real ChatGPT support for `ui/download-file`, `window.openai.uploadFile`, and uploaded-image context must be checked in your client. The viewer disables or hides unsupported controls and reports failures. It does not create native attachments automatically or write files into Python.
- A live Wikimedia search could not be completed from this workspace's restricted network. Brave was checked with mock responses; no real Brave key was supplied or charged. Actual search quality and source downloads depend on the providers and your host.
- No Docker daemon was available here, so the Docker image was not built. The application dependencies were installed and the server was exercised directly with Node.
