# Updating an existing Image Scout

This archive is a complete project with the in-chat viewer and Serper-backed Google Images search. Replace the repository contents with this archive's contents and redeploy. Keep your existing `.env` values private.

Set:

```env
SEARCH_PROVIDER=serper
SERPER_API_KEY=your_serper_key
```

Then refresh the custom MCP connection in regular ChatGPT and start a new chat. Run `vision_self_test` before searching.

Serper handles Google access outside your server, so the server no longer scrapes Google HTML directly in the default mode. Its free quota is controlled by Serper; the package reports key and quota errors clearly.
