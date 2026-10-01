export function getCardImageSource(
  imageUrl: string | null,
  thumbnailUrl: string | null,
  preferThumbnail: boolean = false
): { uri: string } | null {
  if (preferThumbnail && thumbnailUrl) {
    return { uri: thumbnailUrl };
  }
  if (imageUrl) {
    return { uri: imageUrl };
  }
  if (thumbnailUrl) {
    return { uri: thumbnailUrl };
  }
  return null;
}
