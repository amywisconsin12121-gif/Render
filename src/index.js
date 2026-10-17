import { loadConfig } from './config.js';
import { createApp } from './server.js';

try {
  const config = loadConfig();
  const { app } = createApp(config);
  const server = app.listen(config.port, config.host, () => {
    console.log(`Image Scout ready on port ${config.port}; search provider: ${config.provider}.`);
    console.log('Open the service homepage to build your private ChatGPT connection URL.');
  });
  server.requestTimeout = 90000;
  server.headersTimeout = 15000;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
