// Server-only settings. Never expose these to the browser.
export const config = {
  port: Number(process.env.PORT ?? 8787),
  metaApiKey: process.env.META_API_KEY ?? '',
  metaBaseUrl: process.env.META_BASE_URL ?? 'https://api.meta.ai/v1',
  textModel: process.env.META_TEXT_MODEL ?? 'muse-spark-1.1',
  imageModel: process.env.META_IMAGE_MODEL ?? 'muse-image-1.0',
  // Optional. Leave blank to let the model pick its own size.
  avatarSize: process.env.META_AVATAR_SIZE || undefined,
  panelSize: process.env.META_PANEL_SIZE || undefined,
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90_000),
  // Browser origins allowed to call this server (the Vite dev server and the iOS app).
  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,capacitor://localhost,ionic://localhost,http://localhost')
    .split(',').map(s => s.trim()).filter(Boolean),
  // Where generated images are saved. Swap for blob storage before launch.
  imageDir: new URL('./generated/', import.meta.url),
}
