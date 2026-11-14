// Default backend. Each device can override these in the settings drawer.
// mode "gateway" = DeepSearch token gateway (/api/search, /api/engines)
// mode "searxng" = plain SearXNG JSON API (/search?format=json)
window.DEEPSEARCH_CONFIG = {
  apiBase: "https://tv.xatmarket.com/deepsearch-api",
  searchPath: "/api/search",
  pageSize: 10,
  thumbProxy: "auto"   // use GET /api/thumb when the server has it; falls back to direct no-referrer loads
};
