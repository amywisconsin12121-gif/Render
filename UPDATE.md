# Update your existing Image Scout

This update adds an in-chat image viewer. Your hosted plugin downloads the pictures and delivers their bytes to that viewer, so displaying them does not require Python internet access or external image embeds.

## 1. Upload the update to your existing GitHub repository

1. Download and unzip **image-scout-display-update.zip** on your computer.
2. Open the GitHub repository you already connected to Render. Select the branch Render deploys, usually **main**.
3. Choose **Add file → Upload files**.
4. Drag the unzipped folder's **contents** into the upload area, including the `src`, `public`, `scripts`, and `test` folders. Do not upload the ZIP itself or an extra parent folder. You should see paths such as `src/mcp.js` and `public/image-gallery.html`.
5. Select **Commit changes** to that deployment branch. This replaces the included files while retaining the rest of your repository.

The archive contains only the update files. It omits `src/providers.js`, `.env`, and hosting configuration, so it leaves your Safe Search edit, keys, connection secret, and hosting settings alone. Keep the other existing repository files. You do not need a new GitHub repository or Render service.

## 2. Deploy on Render

1. Open your existing service in the [Render dashboard](https://dashboard.render.com/).
2. If automatic deployment is enabled, wait for this commit to finish deploying. Otherwise select **Manual Deploy → Deploy latest commit**.
3. Wait until Render reports **Live**.

## 3. Refresh the plugin in ChatGPT

1. Open **Plugins → Image Scout** in ChatGPT.
2. Open its custom MCP connection and select **Refresh**. This is necessary because the tool list and UI resource changed.
3. Check that its tools now include **show_images**: there should be six tools in total.
4. Start a **new regular Chat** and select **@Image Scout**. Keep the same MCP connection URL and secret.

## 4. Check the display

Send this first:

> Run vision_self_test, read its six-digit code from the image, and check it with check_image_vision. If you cannot see the pixels, say so. Show me the test picture in the plugin viewer.

You should see a picture, and the model's check should return `passed: true`. Those are separate checks. If you see only text, refresh the connection and start a fresh chat. If your ChatGPT client does not support MCP Apps UI, the server cannot enable that missing feature.

Then send:

> Search for “black cat looking left”. Look directly at the pictures, choose a match, display it using show_images, and give me its source link. If none matches, say so.

## What the buttons do

- **Download image** requests a file download to your device using ChatGPT's host API. It is disabled if that client has not enabled downloads.
- **Save to ChatGPT** appears when ChatGPT exposes its upload API. Clicking it uploads the actual image file; only a genuine returned file ID is used for later image context. If Library upload is supported, the saved copy goes there. Otherwise, the client controls the uploaded file's lifetime.
- The picture itself is displayed from the supplied bytes, independently of those optional saving controls. A normal MCP image result does not automatically become a native chat attachment or a Python file.

Images are resized JPEG/PNG copies, up to 1600 pixels per side, with a labeled preview fallback when the original cannot be fetched. Source links still point to the source site's original.

## Why this works around the network issue

[OpenAI documents](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt) that Data Analysis Python cannot make external web requests. That restriction is specific to Python, not all ChatGPT tools. Your hosted MCP server makes the web requests; the in-chat viewer receives the downloaded bytes through the [supported UI bridge](https://developers.openai.com/plugins/build/chatgpt-ui).

The update passed local automated tests. Display and native file saving in your actual ChatGPT client still need the check above after deployment. See [TEST-RESULTS.md](TEST-RESULTS.md) for details.
