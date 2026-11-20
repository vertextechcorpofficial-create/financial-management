export const maxFileSize = 10 * 1024 * 1024;
export const maxFiles = 10;
export const maxUploadSize = maxFiles * maxFileSize + 64 * 1024;
// Leave room below Next's 10 MB middleware request limit.
export const uploadPartSize = 8 * 1024 * 1024;
