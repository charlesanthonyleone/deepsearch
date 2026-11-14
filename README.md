# DeepSearch

A static metasearch front end in an abyss theme. It sits on top of a private SearXNG backend and searches Google, Yandex, Bing, DuckDuckGo, Brave, Mojeek, Startpage and Qwant at once, then merges the results into one list of outbound links.

- Search operators: `"exact phrase"`, `-exclude`, `site:domain`, `OR`
- Toggle each engine on or off, and see which engines didn't respond
- SafeSearch selector that remembers your choice
- Deep Dig: pull 1 to 5 pages from every engine
- Relevance sort, plus a Buried sort that favors exact matches that few engines found and that ranked low
- Badges that show which engine found each result and at what rank
- One-per-domain dedupe, infinite scroll, and site: quick-filter chips you can edit
- No analytics, trackers or cookies. The page is noindex, and every link opens with `rel="noreferrer noopener"`

## Backend

`config.js` sets the default API base. Two request formats work:
- **Gateway** (path `/api/search`): `q, engines, page, deep`, with the `Authorization: Bearer` token
- **Plain SearXNG** (path `/search`): `q, format=json, engines, pageno, safesearch`

To connect, open ⚙ and paste the access token once. It's stored only in this browser's localStorage. No secrets live in this repo.
