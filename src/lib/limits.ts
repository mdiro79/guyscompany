export const MAX_MEMBERS = 4;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
// The office phone's gallery: room per member, and the largest single photo accepted.
export const PHOTO_QUOTA_BYTES = 40 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 1536 * 1024;
export const VISIT_RETENTION_DAYS = 30;
export const READ_NOTIFICATION_RETENTION_DAYS = 45;
export const CHAT_PAGE_SIZE = 80;
export const STORAGE_BUCKET = 'files';
// Cleared done to-dos are kept this long for the streak, then removed by the cleanup cron.
export const CLEARED_TODO_RETENTION_DAYS = 60;
