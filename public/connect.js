const secret = document.querySelector('#secret');
const message = document.querySelector('#message');
const result = document.querySelector('#result');
const urlField = document.querySelector('#url');
document.querySelector('#build').addEventListener('click', async () => {
  const value = secret.value.trim();
  if (value.length < 32 || value.length > 512) { message.textContent = 'Use the exact MCP_SECRET from your host (32–512 characters).'; return; }
  if (!globalThis.crypto?.subtle) { message.textContent = 'Open this page over HTTPS (or localhost) to create the URL.'; return; }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const token = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  urlField.value = `${location.origin}/mcp/${token}`;
  secret.value = '';
  message.textContent = 'URL created locally. A wrong secret produces a URL that will not connect.';
  result.hidden = false;
});
document.querySelector('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(urlField.value); message.textContent = 'Copied. Keep this URL private.'; }
  catch { urlField.focus(); urlField.select(); message.textContent = 'Select and copy the URL above.'; }
});
