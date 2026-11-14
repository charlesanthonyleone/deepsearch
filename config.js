// Default backend. Each device can override these in the settings drawer.
// mode "gateway" = DeepSearch token gateway (/api/search, /api/engines)
// mode "searxng" = plain SearXNG JSON API (/search?format=json)
window.DEEPSEARCH_CONFIG = {
  apiBase: "https://tv.xatmarket.com/deepsearch-api",
  searchPath: "/api/search",
  pageSize: 10
};
