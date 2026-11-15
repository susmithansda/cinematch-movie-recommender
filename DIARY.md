# Cinema Passport

The passport is a private watched-movie diary stored in D1. Every query and mutation uses the current account's stable owner id. Diary records are not stored in browser localStorage or shared across unrelated email, Google, Facebook or platform identities.

## API

- `GET /api/diary` returns `{entries:[{movie,rating,note,watchedAt}]}`, ordered by watched date (newest first), up to 500 entries.
- `PUT /api/diary` accepts `{movie,rating,note,watchedAt}` and returns `{entry}`. Saving the same movie updates its entry. A member can keep up to 500 different movies; an entry remains editable when the passport is full.
- `DELETE /api/diary?id=<movie-id>` removes only that member's matching entry and returns `{ok:true}`.

All routes require authentication. Mutation requests validate origin and apply a database-backed write limit. PUT requires JSON. Personal `rating` is an integer from 1 through 5, or `null` for no personal score; it never overwrites `movie.rating`, which belongs to the movie data provider. `note` is plain text, at most 1,000 characters, for escaped rendering by React. `watchedAt` must be a real calendar date in `YYYY-MM-DD` format. Dates have no timezone conversion on storage or retrieval.

Only bounded movie fields are stored. Industry, original language, source and store links survive saves. Media URLs must be HTTPS or safe root-relative assets. Unknown fields are discarded. A single atomic insert/upsert statement enforces the 500-entry capacity, including concurrent requests.

The client-safe type lives in `lib/diary-types.ts`. Server behavior lives in `lib/diary.ts`; the route applies the existing API error wrapper. Schema changes are in an append-only migration. Apply the new migration to local D1 before previewing the passport; publication applies hosted migrations separately.
