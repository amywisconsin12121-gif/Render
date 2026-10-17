# Host Image Scout, then use it in regular Chat

## 1. Put the code on GitHub

Unzip the download. Create an empty GitHub repository. Use **Add file → Upload files** to upload the **contents of the `image-scout` folder**: `package.json`, `Dockerfile`, `render.yaml`, the `src` folder, and the other supplied files must be at the repository root. Commit the upload.

Do not upload `node_modules` or a real `.env` file. They are not in this download.

## 2. Host on Render

1. Sign in to [Render](https://dashboard.render.com/). Choose **New → Blueprint**, connect your GitHub repository, and let it read `render.yaml`.
2. Review the selected hosting plan and deploy. The supplied template selects the free plan if available; sleeping services can cause connection timeouts. The first deploy uses **Wikimedia Commons only**, so no search API key is needed.
3. For **broad web image search**, get a [Brave Search API key](https://api-dashboard.search.brave.com/) with image-search access. In Render's **Environment** settings, change `SEARCH_PROVIDER` to `brave` and add `BRAVE_API_KEY` with your key, then save and redeploy. This is a search-provider key, **not an OpenAI key**. Hosting and search usage follow their providers' terms.
4. After the service is live, open its public HTTPS address.

You can leave Wikimedia mode enabled if its narrower catalog is sufficient. Both modes return actual image pixels.

## 3. Connect to regular ChatGPT

1. In Render's service **Environment** settings, copy the generated `MCP_SECRET` value.
2. Paste it into the homepage of **your deployed Image Scout service**. Click **Create connection URL**, then **Copy URL**. The secret stays in your browser.
3. In ChatGPT, open **Plugins → + → Add custom MCP server**. Name it **Image Scout**, paste the copied MCP URL, and choose **No authentication**. The private URL token controls access.
4. Create and enable it. Start a new regular **Chat**, then choose **@Image Scout**.

Custom MCP access must be available to your account/workspace. If the connection menu is missing, check [OpenAI's current connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) and your workspace's tool permissions.

## 4. Check that ChatGPT really receives pictures

Send:

> Run Image Scout's vision_self_test, read the six-digit code from the image, and check it with check_image_vision. If you cannot see the image, say so.

Only proceed if the check reports `passed: true`. The answer is randomly generated and withheld from text metadata. This checks pixel delivery in your client; it does not guarantee that every later visual judgment is correct.

Then try:

> Search for “black cat looking left”. Inspect the actual images. Choose one where the cat is facing toward the left edge of the picture. Use a larger view if unclear. Return its image and source link. If none matches, keep searching or say none matches. Do not choose using filenames, captions, tags, or URLs.

If the self-test fails, do not accept a claim that the search was visually verified. The server cannot force your ChatGPT client to provide tool images to its model.

## Other hosts

Any Docker-capable host with outbound internet and public HTTPS can run this package. Set `MCP_SECRET`, `SEARCH_PROVIDER`, and (for Brave) `BRAVE_API_KEY`; also set `PUBLIC_BASE_URL` to the public HTTPS origin. Use the supplied `Dockerfile` and health-check path `/healthz`. For a VPS, see the Docker section in [README.md](README.md) and `Caddyfile.example`.

For a local trial without hosting: install Node.js 22.16+ or 24, then run `npm ci`, `npm run setup`, and `npm start`. Open <http://localhost:9000>. ChatGPT's cloud cannot connect to that localhost URL without an appropriate tunnel.
