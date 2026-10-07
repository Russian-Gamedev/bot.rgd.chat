export enum ProjectType {
  Game = 'game',
  Service = 'service',
  Tool = 'tool',
  Other = 'other',
}
export enum ProjectRevisionStatus {
  Draft = 'draft',
  Review = 'review',
  Published = 'published',
}
export enum ProjectAuthorType {
  Discord = 'discord',
  Text = 'text',
}
export enum ProjectAttachmentType {
  Image = 'image',
  ExternalVideo = 'external_video',
}
export enum ProjectUploadKind {
  Banner = 'banner',
  Attachment = 'attachment',
}
export enum ProjectUploadStatus {
  Pending = 'pending',
  Ready = 'ready',
}
export enum ProjectReviewAction {
  Submitted = 'submitted',
  Published = 'published',
  ChangesRequested = 'changes_requested',
}
export enum ProjectListSort {
  ReleaseDateDesc = 'release_date_desc',
  ReleaseDateAsc = 'release_date_asc',
  LikesDesc = 'likes_desc',
  PublishedDesc = 'published_desc',
}
