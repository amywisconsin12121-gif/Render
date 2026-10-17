# Verification

Checked on 17 October 2026 with Node.js 24.19.0.

- `npm test`: **19 passed, 0 failed** using Node's built-in test runner.
- A real HTTP connection using the official MCP SDK client completed initialization, discovered all five tools, received decodable PNG/JPEG image blocks, inspected a candidate, and resolved the original/source links.
- The search pipeline was tested with synthetic image files and mocked search-provider responses. Tests confirmed that URLs and captions are withheld until the links tool is called.
- The visual self-test image was received through MCP, opened locally, read visually, and answered correctly. This validates this local verification path, **not regular ChatGPT's client**.
- Size limits, local/private-address blocking, DNS-answer validation, redirects to internal addresses, cache expiry, invalid requests, origin checks, secret-URL access, and request limiting passed.
- JavaScript syntax checks and parsing of the Docker Compose / Render YAML files passed.
- The connection helper homepage was checked over HTTP. Its browser JavaScript passed syntax checks; a full browser run could not be completed because no browser binary is installed in this workspace.
- `npm audit --omit=dev`: **0 known vulnerabilities** at verification time. The dependency lockfile is included.

## Still to check after you host it

- A live Wikimedia search could not be completed from this workspace's restricted network. Brave was checked with mock API responses; no real Brave key was supplied or charged.
- No Docker daemon was available here, so the Docker image was not built in this environment. The same application dependencies were installed and the server was run directly with Node.
- Nothing was deployed or connected to your ChatGPT account. Run the included self-test in your actual regular ChatGPT Chat. If the model cannot read its image, do not accept later claims of visual verification.
- Real search quality, host availability, hotlink rendering, and ChatGPT account/model permissions depend on the providers and your setup.
