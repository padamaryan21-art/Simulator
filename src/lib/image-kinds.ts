/**
 * What an image is. There is deliberately no "win / payout" kind: the library is for everyday
 * photos, memes and plain game-lobby screenshots.
 */
export const IMAGE_KINDS = ["PHOTO", "MEME", "GAME_LOBBY", "OTHER"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
