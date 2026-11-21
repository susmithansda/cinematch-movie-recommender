export type MovieIndustry = "hollywood" | "bollywood" | "bengali" | "international";

export type Movie = {
  id: string;
  title: string;
  searchAliases?: string[];
  year: number;
  releaseDate: string;
  genres: string[];
  rating: number | null;
  duration: number | null;
  overview: string;
  poster: string;
  backdrop: string;
  trailer?: string;
  language?: string;
  originalLanguage?: string;
  industry?: MovieIndustry;
  source?: string;
  storeUrl?: string;
};

export type MovieCatalog = {
  movies: Movie[];
  source: string;
  live: boolean;
  updatedAt: string;
  notice?: string;
};

const poster = (path: string) => `https://image.tmdb.org/t/p/w500/${path}.jpg`;
const backdrop = (path: string) => `https://image.tmdb.org/t/p/original/${path}.jpg`;

/** An editorial collection, never presented as a current release feed.
 * Ratings are deliberately omitted: no live review provider has supplied them.
 */
const INTERNATIONAL_COLLECTION: Movie[] = [
  {
    id: "seed-693134", title: "Dune: Part Two", year: 2024, releaseDate: "2024-02-27",
    genres: ["Science Fiction", "Adventure"], rating: null, duration: 167,
    overview: "Paul Atreides joins Chani and the Fremen on the desert world of Arrakis, where love, destiny, and the future of an empire collide.",
    poster: poster("1pdfLvkbY9ohJlCjQH2CZjjYVvJ"), backdrop: "/arrakis-hero.jpg",
    trailer: "https://www.youtube.com/watch?v=Way9Dexny3w", language: "English", source: "Curated collection",
  },
  {
    id: "seed-872585", title: "Oppenheimer", year: 2023, releaseDate: "2023-07-19",
    genres: ["Drama", "History"], rating: null, duration: 181,
    overview: "A brilliant physicist faces the extraordinary scientific challenge and lasting human consequences of the Manhattan Project.",
    poster: poster("8Gxv8gSFCU0XGDykEGv7zR1n2ua"), backdrop: backdrop("fm6KqXpk3M2HVveHwCrBSSBaO0V"),
    trailer: "https://www.youtube.com/watch?v=uYPbbksJxIg", language: "English", source: "Curated collection",
  },
  {
    id: "seed-792307", title: "Poor Things", year: 2023, releaseDate: "2023-12-07",
    genres: ["Science Fiction", "Romance", "Comedy"], rating: null, duration: 142,
    overview: "Bella Baxter embarks on an exuberant journey of discovery through a beautifully strange world, determined to live on her own terms.",
    poster: poster("kCGlIMHnOm8JPXq3rXM6c5wMxcT"), backdrop: backdrop("zh6IdheEYinU4TPtorWsjx6qPQE"),
    trailer: "https://www.youtube.com/watch?v=RlbR5N6veqw", language: "English", source: "Curated collection",
  },
  {
    id: "seed-569094", title: "Spider-Man: Across the Spider-Verse", year: 2023, releaseDate: "2023-05-31",
    genres: ["Animation", "Action", "Adventure"], rating: null, duration: 140,
    overview: "Miles Morales swings into a kaleidoscope of alternate worlds and meets a society of Spider-People with very different ideas about being a hero.",
    poster: poster("8Vt6mWEReuy4Of61Lnj5Xj704m8"), backdrop: backdrop("4HodYYKEIsGOdinkGi2Ucz6X9i0"),
    trailer: "https://www.youtube.com/watch?v=cqGjhVJWtEg", language: "English", source: "Curated collection",
  },
  {
    id: "seed-414906", title: "The Batman", year: 2022, releaseDate: "2022-03-01",
    genres: ["Crime", "Mystery", "Thriller"], rating: null, duration: 176,
    overview: "A young Batman follows a trail of cryptic clues through Gotham's rain-soaked streets and confronts the city's tangled history.",
    poster: poster("74xTEgt7R36Fpooo50r9T25onhq"), backdrop: backdrop("b0PlSFdDwbyK0cf5RxwDpaOJQvQ"),
    trailer: "https://www.youtube.com/watch?v=mqqft2x_Aa4", language: "English", source: "Curated collection",
  },
  {
    id: "seed-157336", title: "Interstellar", year: 2014, releaseDate: "2014-11-05",
    genres: ["Science Fiction", "Adventure", "Drama"], rating: null, duration: 169,
    overview: "A pilot leaves a struggling Earth and the family he loves to search beyond the stars for a future for humanity.",
    poster: poster("gEU2QniE6E77NI6lCU6MxlNBvIx"), backdrop: backdrop("xJHokMbljvjADYdit5fK5VQsXEG"),
    trailer: "https://www.youtube.com/watch?v=zSWdZVtXT7E", language: "English", source: "Curated collection",
  },
  {
    id: "seed-438631", title: "Dune", year: 2021, releaseDate: "2021-09-15",
    genres: ["Science Fiction", "Adventure"], rating: null, duration: 155,
    overview: "The heir to House Atreides travels to the universe's most dangerous planet, where a precious resource holds the key to power.",
    poster: poster("d5NXSklXo0qyIYkgV94XAgMIckC"), backdrop: backdrop("d5NXSklXo0qyIYkgV94XAgMIckC"),
    trailer: "https://www.youtube.com/watch?v=8g18jFHCLXk", language: "English", source: "Curated collection",
  },
  {
    id: "seed-27205", title: "Inception", year: 2010, releaseDate: "2010-07-15",
    genres: ["Action", "Science Fiction", "Thriller"], rating: null, duration: 148,
    overview: "An expert dream thief accepts an impossible assignment: plant an idea inside a mind while his own memories threaten the mission.",
    poster: poster("oYuLEt3zVCKq57qu2F8dT7NIa6f"), backdrop: backdrop("s3TBrRGB1iav7gFOCNx3H31MoES"),
    trailer: "https://www.youtube.com/watch?v=YoHD9XEInc0", language: "English", source: "Curated collection",
  },
  {
    id: "seed-1184918", title: "The Wild Robot", year: 2024, releaseDate: "2024-09-12",
    genres: ["Animation", "Family", "Adventure"], rating: null, duration: 102,
    overview: "Stranded on an untamed island, a robot learns to understand its animal neighbors and discovers an unexpected bond with an orphaned gosling.",
    poster: poster("wTnV3PCVW5O92JMrFvvrRcV39RU"), backdrop: backdrop("mKOBdgaEFguADkJhfFslY7TYxIh"),
    trailer: "https://www.youtube.com/watch?v=67vbA5ZJdKQ", language: "English", source: "Curated collection",
  },
  {
    id: "seed-1022789", title: "Inside Out 2", year: 2024, releaseDate: "2024-06-11",
    genres: ["Animation", "Comedy", "Family"], rating: null, duration: 97,
    overview: "Riley's emotions are navigating adolescence when a new arrival, Anxiety, turns headquarters upside down.",
    poster: poster("vpnVM9B6NMmQpWeZvzLvDESb2QY"), backdrop: backdrop("xg27NrXi7VXCGUr7MG75UqLl6Vg"),
    trailer: "https://www.youtube.com/watch?v=LEjhY15eCx0", language: "English", source: "Curated collection",
  },
  {
    id: "seed-603692", title: "John Wick: Chapter 4", year: 2023, releaseDate: "2023-03-22",
    genres: ["Action", "Crime", "Thriller"], rating: null, duration: 170,
    overview: "John Wick takes his fight against the High Table around the world, seeking a path to freedom through an unforgiving criminal underworld.",
    poster: poster("vZloFAK7NmvMGKE7VkF5UHaz0I"), backdrop: backdrop("h8gHn0OzBoaefsYseUByqsmEDMY"),
    trailer: "https://www.youtube.com/watch?v=qEVUtrk8_B4", language: "English", source: "Curated collection",
  },
  {
    id: "seed-313369", title: "La La Land", year: 2016, releaseDate: "2016-11-29",
    genres: ["Romance", "Drama", "Music"], rating: null, duration: 129,
    overview: "An aspiring actress and a jazz musician fall in love in Los Angeles, where pursuing their dreams may carry them in different directions.",
    poster: poster("uDO8zWDhfWwoFdKS4fzkUJt0Rf0"), backdrop: backdrop("nlPCdZlHtRNcF6C9hzUH4ebmV1w"),
    trailer: "https://www.youtube.com/watch?v=0pdqf4P9MB8", language: "English", source: "Curated collection",
  },
  {
    id: "seed-244786", title: "Whiplash", year: 2014, releaseDate: "2014-10-10",
    genres: ["Drama", "Music"], rating: null, duration: 107,
    overview: "An ambitious jazz drummer is pushed to his limits by an instructor whose demanding methods blur the line between excellence and obsession.",
    poster: poster("7fn624j5lj3xTme2SgiLCeuedmO"), backdrop: backdrop("7fn624j5lj3xTme2SgiLCeuedmO"),
    trailer: "https://www.youtube.com/watch?v=7d_jQycdQGo", language: "English", source: "Curated collection",
  },
  {
    id: "seed-496243", title: "Parasite", year: 2019, releaseDate: "2019-05-30",
    genres: ["Thriller", "Drama", "Comedy"], rating: null, duration: 132,
    overview: "A resourceful family finds a way into the home of a wealthy household, setting off an unpredictable collision of two very different lives.",
    poster: poster("7IiTTgloJzvGI1TAYymCfbfl3vT"), backdrop: backdrop("TU9NIjwzjoKPwQHoHshkFcQUCG"),
    trailer: "https://www.youtube.com/watch?v=5xH0HfJHsaY", language: "Korean", source: "Curated collection",
  },
  {
    id: "seed-329865", title: "Arrival", year: 2016, releaseDate: "2016-11-10",
    genres: ["Science Fiction", "Drama", "Mystery"], rating: null, duration: 116,
    overview: "When mysterious spacecraft arrive around the world, a linguist must discover how to communicate before fear divides humanity.",
    poster: poster("x2FJsf1ElAgr63Y3PNPtJrcmpoe"), backdrop: backdrop("x2FJsf1ElAgr63Y3PNPtJrcmpoe"),
    trailer: "https://www.youtube.com/watch?v=tFMo3UJ4B4g", language: "English", source: "Curated collection",
  },
  {
    id: "seed-508442", title: "Soul", year: 2020, releaseDate: "2020-12-25",
    genres: ["Animation", "Family", "Music"], rating: null, duration: 101,
    overview: "A New York jazz musician takes an unexpected detour through the Great Before and discovers the small moments that make a life.",
    poster: poster("hm58Jw4Lw8OIeECIq5qyPYhAeRJ"), backdrop: backdrop("kf456ZqeC45XTvo6W9pW5clYKfQ"),
    trailer: "https://www.youtube.com/watch?v=xOsLIiBStEs", language: "English", source: "Curated collection",
  },
];

/** Hindi-language originals, including older favorites; these are editorial
 * picks rather than a promise of current theatrical availability. */
export const BOLLYWOOD_MOVIES: Movie[] = [
  {
    id: "seed-1725493231", title: "Jawan (Extended Cut)", year: 2023, releaseDate: "2023-09-07",
    genres: ["Action", "Thriller", "Drama"], rating: null, duration: 171,
    overview: "A determined vigilante and his unlikely team challenge a powerful system, while a family history gives his mission a deeply personal purpose.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/Video116/v4/42/62/0d/42620d4f-7dd1-99d1-ae44-c27b5022b6be/RCE043_Poster_WW_V2.jpg/600x900bb.jpg",
    backdrop: "/jawan-hero.jpg", trailer: "https://video-ssl.itunes.apple.com/itunes-assets/Video116/v4/57/6d/2f/576d2f83-88bc-926b-e3b9-b78cad5ab0fb/mzvf_12888355625505144365.640x356.h264lc.U.p.m4v",
    storeUrl: "https://itunes.apple.com/in/movie/jawan-extended-cut/id1725493231?uo=4", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
  },
  {
    id: "seed-7000000002", title: "Zindagi Na Milegi Dobara", year: 2011, releaseDate: "2011-07-15",
    genres: ["Adventure", "Comedy", "Drama", "Romance"], rating: null, duration: 154,
    overview: "Three old friends reunite for a road trip through Spain, where unexpected adventures and honest conversations change the way they see their lives.",
    poster: poster("hKO9O715wYxjkQSEv47giCYcyO8"), backdrop: "https://is1-ssl.mzstatic.com/image/thumb/Features124/v4/3d/0c/da/3d0cdaaf-e4b4-9271-71ff-c56cbf4957bf/mzl.qyvzwtpj.png/2400x1350sr-60.jpg",
    trailer: "https://www.youtube.com/watch?v=ifIBOKCfjVs", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Curated collection",
  },
  {
    id: "seed-7000000003", title: "12th Fail", year: 2023, releaseDate: "2023-10-27",
    genres: ["Drama", "History"], rating: null, duration: 147,
    overview: "A young man from rural India rebuilds his education and takes on the formidable civil-service examinations with determination, friendship, and hope.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/UCbpJwsVShPQEkaEiaihZg/600x900.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/VaG-Y3T46N3Rny4PJYRZvA/2400x1350.jpg",
    trailer: "https://www.youtube.com/watch?v=WW_oAEdiUnY", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
    storeUrl: "https://tv.apple.com/us/movie/12th-fail/umc.cmc.22akjgefslahezpwegmoevdap",
  },
  {
    id: "seed-1670881249", title: "Pathaan", year: 2023, releaseDate: "2023-01-25",
    genres: ["Action", "Adventure", "Thriller"], rating: null, duration: 146,
    overview: "An Indian intelligence agent returns from exile to stop a dangerous mercenary, with an enigmatic ally and the fate of a nation hanging in the balance.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/Video116/v4/c7/0f/9f/c70f9f60-47c5-9e59-4a3d-ede9cce74e5f/4ff81f3f-0f0f-442c-8ee7-d40cd394d456_Pathaan_SpyLogo.jpg/600x900bb.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/Video116/v4/c7/0f/9f/c70f9f60-47c5-9e59-4a3d-ede9cce74e5f/4ff81f3f-0f0f-442c-8ee7-d40cd394d456_Pathaan_SpyLogo.jpg/1200x675bb.jpg",
    trailer: "https://video-ssl.itunes.apple.com/itunes-assets/Video126/v4/71/a4/e6/71a4e6f6-6d9d-2cf4-f4d7-1424d62f9ebf/mzvf_3114374173775718149.640x352.h264lc.U.p.m4v",
    storeUrl: "https://itunes.apple.com/in/movie/pathaan/id1670881249?uo=4", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
  },
  {
    id: "seed-1884433513", title: "Dangal", year: 2016, releaseDate: "2016-12-21",
    genres: ["Drama", "Family"], rating: null, duration: 154,
    overview: "A former wrestler sees extraordinary potential in his daughters and helps them challenge expectations on their journey toward international competition.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/Video221/v4/79/a4/b8/79a4b858-20a1-70e3-8033-afb8d7b848a0/FK_1209_JS_Dangal.jpg/600x900bb.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/Video221/v4/79/a4/b8/79a4b858-20a1-70e3-8033-afb8d7b848a0/FK_1209_JS_Dangal.jpg/1200x675bb.jpg",
    trailer: "https://video-ssl.itunes.apple.com/itunes-assets/Video221/v4/e3/e9/c4/e3e9c4c4-0e43-eb22-05e1-33103f5b71ef/mzvf_10185982395003304445.640x358.h264lc.U.p.m4v",
    storeUrl: "https://itunes.apple.com/in/movie/dangal/id1884433513?uo=4", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
  },
  {
    id: "seed-7000000006", title: "3 Idiots", year: 2009, releaseDate: "2009-12-25",
    genres: ["Comedy", "Drama"], rating: null, duration: 171,
    overview: "Two friends set out to find the unconventional classmate who taught them to question rigid expectations and follow the things that truly matter.",
    poster: poster("66A9MqXOyVFCssoloscw79z8Tew"), backdrop: backdrop("66A9MqXOyVFCssoloscw79z8Tew"),
    trailer: "https://www.youtube.com/watch?v=xvszmNXdM4w", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Curated collection",
  },
  {
    id: "seed-7000000007", title: "Laapataa Ladies", year: 2024, releaseDate: "2024-03-01",
    genres: ["Comedy", "Drama"], rating: null, duration: 123,
    overview: "A train journey and a case of mistaken identity send two newly married women in unexpected directions, opening up new possibilities for both.",
    poster: "https://www.impawards.com/intl/india/2024/posters/laapataa_ladies_ver2_xxlg.jpg",
    backdrop: "https://www.impawards.com/intl/india/2024/posters/laapataa_ladies_ver2_xxlg.jpg",
    trailer: "https://www.youtube.com/watch?v=hGM87LCJxRc", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Curated collection",
  },
  {
    id: "seed-1590176147", title: "Gully Boy", year: 2019, releaseDate: "2019-02-14",
    genres: ["Drama", "Music"], rating: null, duration: 154,
    overview: "A young man in Mumbai finds his voice through rap, turning the pressures and possibilities of his neighborhood into a powerful creative dream.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/Video115/v4/bb/fa/d8/bbfad847-c67e-4ff0-52ff-c55c247f1f73/FK_849_EXL_GB.jpg/600x900bb.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/Video115/v4/bb/fa/d8/bbfad847-c67e-4ff0-52ff-c55c247f1f73/FK_849_EXL_GB.jpg/1200x675bb.jpg",
    trailer: "https://video-ssl.itunes.apple.com/itunes-assets/Video125/v4/53/d7/e9/53d7e9f6-5686-bbd9-6ef7-4493b2b47b0a/mzvf_14404420524104938676.640x380.h264lc.U.p.m4v",
    storeUrl: "https://itunes.apple.com/in/movie/gully-boy/id1590176147?uo=4", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
  },
  {
    id: "seed-1087341461", title: "Queen", year: 2014, releaseDate: "2014-03-07",
    genres: ["Comedy", "Drama"], rating: null, duration: 143,
    overview: "After her wedding is called off, a sheltered young woman takes her planned honeymoon alone and discovers a world of independence and unexpected friendship.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/Video49/v4/95/b1/4d/95b14d1a-940b-779f-1336-74d66fb21bc3/FK_294_VI_Queen-en-US-IN.jpg/600x900bb.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/Video49/v4/95/b1/4d/95b14d1a-940b-779f-1336-74d66fb21bc3/FK_294_VI_Queen-en-US-IN.jpg/1200x675bb.jpg",
    trailer: "https://video-ssl.itunes.apple.com/itunes-assets/Video118/v4/98/ef/fc/98effc85-9d72-2c33-e272-89cd8bd60da1/mzvf_7440102503071771265.640x360.h264lc.U.p.m4v",
    storeUrl: "https://itunes.apple.com/in/movie/queen/id1087341461?uo=4", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
  },
  {
    id: "seed-1448101698", title: "Andhadhun", year: 2018, releaseDate: "2018-10-05",
    genres: ["Crime", "Thriller", "Comedy"], rating: null, duration: 137,
    overview: "A pianist pretending to be blind becomes entangled in a murder, setting off a darkly comic chain of lies, narrow escapes, and shifting loyalties.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/Video124/v4/19/91/5b/19915b28-d3fc-a597-dd91-8b28808c12ad/FK_837_VI_Andhadhun-IN.jpg/600x900bb.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/Video124/v4/19/91/5b/19915b28-d3fc-a597-dd91-8b28808c12ad/FK_837_VI_Andhadhun-IN.jpg/1200x675bb.jpg",
    trailer: "https://video-ssl.itunes.apple.com/itunes-assets/Video114/v4/20/44/8f/20448fa6-89d0-a01c-7c0c-182ff42dc092/mzvf_2342684215095612300.640x378.h264lc.U.p.m4v",
    storeUrl: "https://itunes.apple.com/in/movie/andhadhun/id1448101698?uo=4", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
  },
  {
    id: "seed-7000000011", title: "Brahmastra: Part One - Shiva", year: 2022, releaseDate: "2022-09-09",
    genres: ["Fantasy", "Action", "Adventure", "Romance"], rating: null, duration: 167,
    overview: "A young DJ discovers a mysterious connection to fire and enters a hidden world of ancient powers while trying to protect the people he loves.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/ZoSbPd9O6u_VJQ6J9uzNmg/600x900nr.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/ZoSbPd9O6u_VJQ6J9uzNmg/1200x675.jpg",
    trailer: "https://www.youtube.com/watch?v=AgS_6UbQ8JM", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
    storeUrl: "https://tv.apple.com/in/movie/brahmastra-part-one-shiva/umc.cmc.5qljrxgdv8tqkpfx2jgrt2y45",
  },
  {
    id: "seed-7000000012", title: "Stree 2", year: 2024, releaseDate: "2024-08-15",
    genres: ["Horror", "Comedy"], rating: null, duration: 149,
    overview: "Chanderi's unlikely protectors reunite when a terrifying new presence stalks the town, mixing small-town friendships with supernatural chaos.",
    poster: "https://is1-ssl.mzstatic.com/image/thumb/gGx3lQVflcj-ZqTxn9QTzw/600x900.jpg",
    backdrop: "https://is1-ssl.mzstatic.com/image/thumb/gGx3lQVflcj-ZqTxn9QTzw/1200x675.jpg",
    trailer: "https://www.youtube.com/watch?v=KVnheXywIbY", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "Apple iTunes",
    storeUrl: "https://tv.apple.com/in/movie/stree-2/umc.cmc.3tnngr3ia8uot11a5zo7m5mmi",
  },
];

/** Bengali-language originals, independently verified against the distributor listings
 * documented in DATA.md. Unknown theatrical day/month stays empty rather than invented.
 */
export const BENGALI_MOVIES: Movie[] = [
  {
    id: "seed-8000000001", title: "Pather Panchali", searchAliases: ["পথের পাঁচালী", "Song of the Little Road"], year: 1955, releaseDate: "",
    genres: ["Drama", "Family"], rating: null, duration: 125,
    overview: "Young Apu and his sister Durga discover small wonders in rural Bengal as their family faces poverty, change, and the pull of a larger world.",
    poster: "https://s3.amazonaws.com/criterion-production/films/23ccfeaeb65bdd4286a7e7c6d25358cc/93jvZ2Ir3y2yMF3GPgNuDpnia3lDZh_large.jpg",
    backdrop: "/bengali-hero.jpg", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000002", title: "Charulata", searchAliases: ["চারুলতা", "The Lonely Wife"], year: 1964, releaseDate: "",
    genres: ["Drama", "Romance"], rating: null, duration: 119,
    overview: "In nineteenth-century Kolkata, a lonely woman finds a new creative voice when her husband's literary cousin enters her carefully ordered home.",
    poster: "https://s3.amazonaws.com/criterion-production/films/b9bbbcd50d8262d2bd069bdac193e5c7/vHOndyO4VUAr6wtDznPWHLjsdqJszf_large.jpg",
    backdrop: "https://criterion-production.s3.amazonaws.com/carousel-files/6912d9eae4769c5b28ec3be82a5617ad.jpeg", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000003", title: "Baishe Srabon", searchAliases: ["বাইশে শ্রাবণ", "২২শে শ্রাবণ", "Baishey Srabon", "Baishe Shrabon"], year: 2011, releaseDate: "",
    genres: ["Thriller", "Crime", "Mystery"], rating: null, duration: 138,
    overview: "A suspended detective and a younger officer follow Bengali poetry through Kolkata's streets to catch a serial killer whose clues conceal a deeply personal mystery.",
    poster: "https://svf.in/wp-content/uploads/2017/07/Baishey-Srabon-Theatrical-Trailer-Prosenjit-Parambrata-Srijit-Mukherji-2011.jpeg",
    backdrop: "https://svf.in/wp-content/uploads/2017/07/Baishey-Srabon-Theatrical-Trailer-Prosenjit-Parambrata-Srijit-Mukherji-2011.jpeg",
    trailer: "https://www.youtube.com/watch?v=o-Az9dxnQF8", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000004", title: "Aparajito", searchAliases: ["অপরাজিত", "The Unvanquished"], year: 1956, releaseDate: "",
    genres: ["Drama", "Family"], rating: null, duration: 110,
    overview: "Apu moves from childhood in Varanasi toward student life in Kolkata, while his growing independence changes the bond he shares with his mother.",
    poster: "https://s3.amazonaws.com/criterion-production/films/4ff67e257c5508dc05db478f1dbde96c/8GCE6Cx9bXU7RWmOxe8sAzgLISwMeX_large.jpg",
    backdrop: "https://s3.amazonaws.com/criterion-production/carousel-files/fdd5eaf3846a1597d2cb7d6c7af9596a.jpeg", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000005", title: "Apur Sansar", searchAliases: ["অপুর সংসার", "The World of Apu", "Apur Sangsar"], year: 1959, releaseDate: "",
    genres: ["Drama", "Romance"], rating: null, duration: 106,
    overview: "An aspiring writer's unexpected marriage opens a new chapter of love and responsibility, completing Apu's journey from childhood toward fatherhood.",
    poster: "https://s3.amazonaws.com/criterion-production/films/d0a5a4515e021437cc61ea3e1d222187/15ItH9PsTaxYE8ifVgWN06wTyfoLIj_large.jpg",
    backdrop: "https://s3.amazonaws.com/criterion-production/carousel-files/83aab4f4c4a93c9b35eaa96addc37f87.jpeg", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000006", title: "Mahanagar", searchAliases: ["মহানগর", "The Big City"], year: 1963, releaseDate: "",
    genres: ["Drama"], rating: null, duration: 135,
    overview: "A Kolkata homemaker starts working to help her family and discovers a confidence that challenges expectations at home and in the city around her.",
    poster: "https://s3.amazonaws.com/criterion-production/films/ebb3e6ce6778a7c588010b39cba076a8/GQbiSaCYwPh6PwpaBE6DWBLzID0Aqc_large.jpg",
    backdrop: "https://criterion-production.s3.amazonaws.com/carousel-files/26df1afd7227a74985914f6b28f7b38a.jpeg", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000007", title: "Jalsaghar", searchAliases: ["জলসাঘর", "The Music Room"], year: 1958, releaseDate: "",
    genres: ["Drama", "Music"], rating: null, duration: 99,
    overview: "An aristocrat pours his remaining wealth into grand musical evenings as the society beyond his crumbling estate moves into a different age.",
    poster: "https://s3.amazonaws.com/criterion-production/films/76594fe18af7f46ead9d75d5379e5d00/Byr6L7Zb6SVm5i9qyNuiwn8h6Ml6co_large.jpg",
    backdrop: "https://criterion-production.s3.amazonaws.com/carousel-files/10aeaddfdfe67f0df4c9420bfc5ca2f3.jpeg", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000008", title: "Devi", searchAliases: ["দেবী", "The Goddess"], year: 1960, releaseDate: "",
    genres: ["Drama"], rating: null, duration: 99,
    overview: "A young woman's life changes when her father-in-law becomes convinced she is divine, placing a family between faith, affection, and devastating expectations.",
    poster: "https://s3.amazonaws.com/criterion-production/films/41a4603b08ce15c6034852e8f4e43427/xNsamgU90AgSxCEEf6WJUqadV2dfxm_large.jpg",
    backdrop: "https://criterion-production.s3.amazonaws.com/carousel-files/0KLmc4xQB6nnwJ9Px1j3nsKQGyng04O9y5mo6BWO.jpeg", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000009", title: "Chander Pahar", searchAliases: ["চাঁদের পাহাড়", "Mountains of the Moon"], year: 2013, releaseDate: "",
    genres: ["Adventure", "Action"], rating: null, duration: 149,
    overview: "Shankar leaves Bengal for Africa, where a railway job leads him toward wild landscapes, a seasoned explorer, and the lure of a legendary mountain.",
    poster: "https://svf.in/wp-content/uploads/2017/07/Chander-Pahar-Theatrical-Trailer-Dev-Kamaleswar-Mukherjee-2013.jpeg",
    backdrop: "https://svf.in/wp-content/uploads/2017/07/MG_0726-1024x637.jpg", trailer: "https://www.youtube.com/watch?v=w54LYEZE5A0", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000010", title: "Rajkahini", searchAliases: ["রাজকাহিনী"], year: 2015, releaseDate: "",
    genres: ["Drama", "History"], rating: null, duration: 151,
    overview: "As Partition draws a border through their home, Begum Jaan and the women of her household defend their dignity and the place they have built together.",
    poster: "https://svf.in/wp-content/uploads/2017/07/Rajkahini-রাজকাহিনী-Official-Trailer-with-Subtitles-Srijit-Mukherji-2015.jpeg",
    backdrop: "https://svf.in/wp-content/uploads/2017/07/IMG_1406-1024x683.jpg", trailer: "https://www.youtube.com/watch?v=ru4G6EwhK9k", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000011", title: "Hemlock Society", searchAliases: ["হেমলক সোসাইটি"], year: 2012, releaseDate: "",
    genres: ["Drama", "Romance", "Comedy"], rating: null, duration: 140,
    overview: "A heartbroken woman meets an eccentric teacher whose unusual institution takes her on a darkly comic journey toward choosing life and reconnecting with others.",
    poster: "https://svf.in/wp-content/uploads/2017/07/Hemlock-society.jpg",
    backdrop: "https://svf.in/wp-content/uploads/2017/07/ekhon-onek-raat-1024x683.jpg", trailer: "https://www.youtube.com/watch?v=y9KCaYzHYG0", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
  {
    id: "seed-8000000012", title: "Autograph", searchAliases: ["অটোগ্রাফ"], year: 2010, releaseDate: "",
    genres: ["Drama"], rating: null, duration: 139,
    overview: "An ambitious director casts a famous actor in a film inspired by Ray's Nayak, but love, celebrity, and ambition begin to blur the boundary between performance and life.",
    poster: "https://svf.in/wp-content/uploads/2017/07/Autograph.jpg",
    backdrop: "https://svf.in/wp-content/uploads/2017/07/Auograph-1-1024x685.jpg", trailer: "https://www.youtube.com/watch?v=nWubjFn4ci4", language: "Bengali", originalLanguage: "bn", industry: "bengali", source: "Curated collection",
  },
];

export const FALLBACK_MOVIES: Movie[] = [
  ...INTERNATIONAL_COLLECTION.map((movie): Movie => ({
    ...movie,
    industry: movie.language === "Korean" ? "international" : "hollywood",
    originalLanguage: movie.language === "Korean" ? "ko" : "en",
  })),
  ...BOLLYWOOD_MOVIES,
  ...BENGALI_MOVIES,
];

export const MOVIE_GENRES = ["All", "Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller"];
