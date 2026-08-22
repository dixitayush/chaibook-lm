export function youtubeWatchUrl(videoId: string, start?: number) {
  const t = start != null ? `&t=${Math.floor(start)}s` : "";
  return `https://www.youtube.com/watch?v=${videoId}${t}`;
}

export function youtubeEmbedUrl(
  videoId: string,
  start?: number,
  opts?: { autoplay?: boolean; origin?: string },
) {
  const params = new URLSearchParams();
  params.set("rel", "0");
  params.set("modestbranding", "1");
  params.set("playsinline", "1");
  params.set("enablejsapi", "1");
  if (opts?.autoplay) params.set("autoplay", "1");
  if (opts?.origin) params.set("origin", opts.origin);
  if (start != null && start > 0) params.set("start", String(Math.floor(start)));
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
