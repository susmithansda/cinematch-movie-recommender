export type Movie = {
  id: string;
  title: string;
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
export const FALLBACK_MOVIES: Movie[] = [
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

export const MOVIE_GENRES = ["All", "Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller"];
