# Host Image Scout, then use it in regular Chat

## 1. Create a Serper key

Create a Serper account and copy its API key. Serper is the Google-backed search service used by this version. Keep the key private.

## 2. Upload the project

Unzip this archive and upload the **contents of this folder** to the root of a new GitHub repository. `package.json`, `Dockerfile`, `render.yaml`, `src/`, `public/`, and the other files must be at the repository root. Do not upload `.env` or `node_modules`.

## 3. Deploy on Render

1. In Render, choose **New → Blueprint** and connect the repository.
2. Deploy the supplied `render.yaml`. It selects the free plan when available, generates `MCP_SECRET`, and selects `SEARCH_PROVIDER=serper`.
3. In the Render service environment, add `SERPER_API_KEY` with your Serper key.
4. Wait for the service to report **Live**, then open its public HTTPS address.

For another host, set `MCP_SECRET`, `SEARCH_PROVIDER=serper`, `SERPER_API_KEY`, and `PUBLIC_BASE_URL`.

## 4. Connect regular ChatGPT

1. Copy the generated `MCP_SECRET` from the host's environment settings.
2. Paste it into your deployed Image Scout homepage and click **Create connection URL**, then **Copy URL**. The secret is hashed locally in the page.
3. In regular ChatGPT, open **Plugins → Add custom MCP server**, paste the URL, and choose **No authentication**. The private URL token is the authentication.
4. Start a new regular Chat and enable **Image Scout**.

Custom MCP access must be available to your account/workspace. This package cannot enable an account feature that is not exposed to you.

## 5. Verify image delivery

Send:

> Run Image Scout’s `vision_self_test`, read the six-digit code from the image, and call `check_image_vision`. If you cannot see the image, say so. Also show me the test picture.

Proceed only when the check passes and you can see the picture. Then try:

> Search Google Images for “black cat looking left”. Look directly at the pictures, choose a match, display it using `show_images`, and give me its source link. Do not choose using filenames, captions, tags, or URLs.

The automated tests verify MCP transport, the Serper request/response adapter, and image bytes. Only this final test in your actual regular Chat verifies that your ChatGPT client supplies those bytes to the model and renders the viewer.

## Local trial

```bash
npm ci
npm run setup
# edit .env and add SERPER_API_KEY
npm start
```

ChatGPT's cloud normally cannot reach the local address without a supported tunnel.
