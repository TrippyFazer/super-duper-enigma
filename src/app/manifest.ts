import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TFHealth",
    short_name: "TFHealth",
    description: "Your real life, ranked E through S.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    categories: ["health", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Quests", url: "/quests", description: "Today's quests" },
      { name: "Log a workout", url: "/domains/fitness?log=1" },
      { name: "Recipes", url: "/recipes" },
    ],
  };
}
