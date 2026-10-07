export const PROJECTS_CONTENT_TYPE_PATTERN = /^image\//;

export const PROJECTS_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const PROJECTS_PRESIGN_EXPIRES_SECONDS = 15 * 60;

export const PROJECTS_UPLOAD_KEY_PREFIX = 'projects';

/** Abandoned (never completed) uploads are garbage-collected after this. */
export const PROJECTS_PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/** Completed but never attached to a project are garbage-collected after this. */
export const PROJECTS_UNREFERENCED_UPLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
