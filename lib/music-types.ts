export type MusicLanguage = "en" | "hi" | "bn";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  storeUrl: string;
  embedUrl: string;
  youtubeUrl: string;
  releaseDate: string;
  durationMs: number | null;
  language: MusicLanguage;
};

export type MusicCatalog = {
  tracks: MusicTrack[];
  language: MusicLanguage;
  mode: "recent" | "search";
  source: string;
  notice: string;
  updatedAt: string;
  live: boolean;
};
