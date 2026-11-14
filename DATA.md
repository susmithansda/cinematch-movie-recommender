# Movie data

FRAME uses live movie metadata when a provider is reachable. It does not host or stream full films.

## TMDB (recommended)

Set `TMDB_READ_ACCESS_TOKEN` to your TMDB API Read Access Token in the Sites environment, or `.env.local` for local development. The token stays on the server. Deploy again after changing hosted environment variables.

The app uses TMDB's `/3/trending/movie/week`, `/3/movie/now_playing`, `/3/movie/upcoming`, `/3/movie/top_rated`, `/3/discover/movie`, `/3/search/movie`, and `/3/movie/{id}?append_to_response=videos` endpoints. Country selects the release region; it does not guarantee local streaming availability. Upcoming results are filtered to dates on or after today. A genre narrows the returned page of results. Data refreshes from the provider at most every 10 minutes for each filter/search combination.

Official references: [application authentication](https://developer.themoviedb.org/docs/authentication-application), [now playing](https://developer.themoviedb.org/reference/movie-now-playing-list), [image URLs](https://developer.themoviedb.org/docs/image-basics), [TMDB attribution](https://developer.themoviedb.org/docs/faq).

This product uses the TMDB API but is not endorsed or certified by TMDB. Film artwork belongs to its respective rights holders.

## Apple iTunes (no API key)

Without a TMDB token, the app tries Apple's movie catalog. Search calls `https://itunes.apple.com/search` with `media=movie`, `entity=movie`, a country code, and the search term. The latest tab requests the current release year with `attribute=releaseYearTerm` and sorts the returned catalog by release date. Browsing calls the legacy `https://itunes.apple.com/{country}/rss/topmovies/limit=100/json` chart feed. When a storefront's search is empty, the app filters the live chart instead; matching editorial picks are identified as curated if the chart also has no matches. Movie details use `https://itunes.apple.com/lookup?id={id}&entity=movie`.

Apple's chart contains popular store movies, not a comprehensive list of theatrical releases or critic scores. The top-rated tab therefore identifies this fallback as a chart. Upcoming theatrical release data requires TMDB. Apple limits the Search API to approximately 20 requests per minute; the app uses server caching and a six-second timeout per request. Availability of the legacy chart feed can change.

Posters and previews promote their matching Apple store title. Detail pages link to the supplied store URL. Video previews are streamed on demand and never downloaded. Previews provided courtesy of iTunes. See [Apple's Search API documentation and promotional-content terms](https://performance-partners.apple.com/search-api).

## Offline editorial collection

If the configured live service fails, the API returns the included 16-film editorial collection with `live: false`, `source: "Curated collection"`, and an explanation. These films are not described as current releases. Ratings are `null` because no live review provider has supplied them. Historical release dates may vary by territory. Upcoming is empty when live upcoming data is unavailable, rather than relabeling older films. `updatedAt` is the provider-fetch or fallback-generation time, not a guarantee that the provider updated each title at that instant.

The included high-resolution movie artwork uses TMDB's public image CDN. The local `public/arrakis-hero.jpg` is a Dune: Part Two promotional VFX still, supplied by [DNEG](https://www.dneg.com/news) from [its public media library](https://images.ctfassets.net/3sjsytt3tkv5/2umXEBNgFkvvOJy5rHHjB3/ca52aecc1b3c0a66b3395b196a95b73c/Dune_Part_Two_-_VFX_still__Paul_and_crowd_.jpg); the film belongs to its respective rights holders. Fallback trailers link to official promotional videos on YouTube. Videos and images remain subject to their hosts' availability and playback policies. Respect each content provider's terms before commercial deployment.
