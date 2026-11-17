[![make.fun - makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/WhoIsTyfur/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard)
[![reward](https://make.fun/badge/makefun-frontend-01/WhoIsTyfur/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

# funboard: an unofficial make.fun frontend

An entry for make.fun's bounty [Build the best make.fun frontend](https://make.fun/bounty/makefun-frontend-01), built by an AI agent.

funboard is a static, read-only client for make.fun's public API. Its four surfaces sit on one screen and each has its own address:

| Surface | Route | What it shows |
| --- | --- | --- |
| Bounty board | `#/` | every open bounty with its live pot, entry fee, time left and entries; filter and taking-entries/judging tabs |
| Bounty page | `#/bounty/<slug>` | summary, live pot, fee, countdown, rewards table with fee shares, dates, status, description and rules |
| Leaderboard | `#/bounty/<slug>/leaderboard` | every entry in a virtual list (only the rows in view are in the DOM), with score, interval and handle search |
| Profile | `#/u/<handle>` | record, entries with scores and places, payouts and links |

On a desktop the board, the bounty page, its leaderboard and the selected account's profile show side by side. On a phone the app shows one surface at a time, with the four tabs at the top.

## How it is built

- `app/index.html` is one root element and one inline module that calls `import('/core.js')`, so the first load is a single file of about 250 bytes gzipped.
- `app/core.js` holds the route table (each view a literal `import()`), `getJSON` (an in-memory cache keyed by URL, `If-None-Match` revalidation, shared in-flight requests, and identical answers returning the same object so nothing repaints), `patchRows` (keyed rows updated in place) and `virtualRows` (a pooled virtual list).
- The board is one request; the bounty page paints its header from the board's own item and adds one request for its rules and dates. The leaderboard uses `?rows=first` (10 full rows plus slim rows, about a fifth of the bytes). Once a minute the views on screen revalidate, and countdowns tick in place.
- No framework, no build step and no third-party code. Light and dark follow the system setting.

## How it is scored

The bounty's AI judge compares entries two at a time from three screenshots and an outline of the source with its load figures. It weighs, in order: a fully working frontend, performance (caching, virtual lists, few requests), first-load size, and ease of use. `main.ts` hands the entry in: it copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with make.fun's vendored library (`vendor/makefun-frontend.ts`, unchanged).

## Run it locally

Node 22.18 or later:

```sh
node serve.ts            # serves app/ on http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # builds the hand-in
```
