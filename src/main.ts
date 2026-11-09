/// <reference types="@songloft/plugin-sdk" />
import { jsonResponse, createRouter } from '@songloft/plugin-sdk';

// 极简后端：只暴露一个「取当前登录 token」的接口，供静态前端免登录调用宿主 API。
// 插件页面本体是 static/index.html，由宿主直接托管（同源，无 CORS）。
const router = createRouter();

router.get('/auth/token', async () => {
  try {
    const plugin = (globalThis as any).songloft?.plugin;
    if (plugin && typeof plugin.getToken === 'function') {
      const token = await plugin.getToken();
      if (token) return jsonResponse({ token });
    }
    return jsonResponse({ error: 'no token available' }, 401);
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'failed to get token' }, 500);
  }
});

async function onInit(): Promise<void> {
  try { (globalThis as any).songloft?.log?.info?.('speaker-remote plugin initialized'); } catch {}
}

async function onDeinit(): Promise<void> {
  try { (globalThis as any).songloft?.log?.info?.('speaker-remote plugin deinitialized'); } catch {}
}

async function onHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  try {
    const res = await router.handle(req);
    if (res) return res;
  } catch (e) {
    // 落到 404
  }
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'not found' }),
  };
}

globalThis.onInit = onInit;
globalThis.onDeinit = onDeinit;
globalThis.onHTTPRequest = onHTTPRequest;
