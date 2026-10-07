import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  PROJECTS_CONTENT_TYPE_PATTERN,
  PROJECTS_MAX_UPLOAD_BYTES,
} from '../projects.constants';
import { normalizeProjectSlug } from '../projects.slug';
import {
  ProjectAttachmentType,
  ProjectAuthorType,
  ProjectListSort,
  ProjectReviewAction,
  ProjectRevisionStatus,
  ProjectType,
  ProjectUploadKind,
  ProjectUploadStatus,
} from '../projects.types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
interface ProjectAuthorShape {
  type: ProjectAuthorType;
  discord_user_id?: string;
  name?: string;
}
@ValidatorConstraint({ name: 'projectAuthorShape' })
class ProjectAuthorShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments) {
    if (!args) return false;
    const author = args.object as ProjectAuthorShape;
    return author.type === ProjectAuthorType.Discord
      ? author.discord_user_id !== undefined && author.name === undefined
      : author.type === ProjectAuthorType.Text
        ? author.name !== undefined && author.discord_user_id === undefined
        : false;
  }
  defaultMessage() {
    return 'discord authors require only discord_user_id; text authors require only name';
  }
}
interface ProjectAttachmentShape {
  type: ProjectAttachmentType;
  upload_id?: string;
  url?: string;
}
@ValidatorConstraint({ name: 'projectAttachmentShape' })
class ProjectAttachmentShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments) {
    if (!args) return false;
    const attachment = args.object as ProjectAttachmentShape;
    return attachment.type === ProjectAttachmentType.Image
      ? attachment.upload_id !== undefined && attachment.url === undefined
      : attachment.type === ProjectAttachmentType.ExternalVideo
        ? attachment.url !== undefined && attachment.upload_id === undefined
        : false;
  }
  defaultMessage() {
    return 'image attachments require only upload_id; external_video attachments require only url';
  }
}
@ValidatorConstraint({ name: 'projectHasImageAttachment' })
class ProjectHasImageAttachmentConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown) {
    return (
      Array.isArray(value) &&
      value.some(
        (attachment) =>
          attachment &&
          typeof attachment === 'object' &&
          'type' in attachment &&
          attachment.type === ProjectAttachmentType.Image,
      )
    );
  }
  defaultMessage() {
    return 'At least one image attachment is required.';
  }
}
export class ProjectAuthorInputDto {
  @IsEnum(ProjectAuthorType)
  @Validate(ProjectAuthorShapeConstraint)
  type: ProjectAuthorType;
  @ValidateIf((o) => o.type === ProjectAuthorType.Discord)
  @IsNumberString()
  discord_user_id?: string;
  @ValidateIf((o) => o.type === ProjectAuthorType.Text)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  role: string;
}
export class ProjectLinkInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icon: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  link: string;
}
export class ProjectAttachmentInputDto {
  @IsEnum(ProjectAttachmentType)
  @Validate(ProjectAttachmentShapeConstraint)
  type: ProjectAttachmentType;
  @ValidateIf((o) => o.type === ProjectAttachmentType.Image)
  @IsUUID()
  upload_id?: string;
  @ValidateIf((o) => o.type === ProjectAttachmentType.ExternalVideo)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url?: string;
}
export class CreateProjectUploadDto {
  @IsEnum(ProjectUploadKind)
  kind: ProjectUploadKind;
  @IsString()
  @Matches(PROJECTS_CONTENT_TYPE_PATTERN, {
    message: 'Only image content types are allowed.',
  })
  content_type: string;
  @IsNumber()
  @Min(1)
  @Max(PROJECTS_MAX_UPLOAD_BYTES)
  size_bytes: number;
}
export class CreateProjectDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeProjectSlug(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)
  slug?: string;
  @IsString() @MaxLength(20_000) description: string;
  @IsDateString({ strict: true })
  release_date: string;
  @IsEnum(ProjectType)
  type: ProjectType;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  promo?: string | null;
  @IsOptional()
  @IsBoolean()
  hide_owner?: boolean;
  @IsOptional()
  @IsUUID()
  banner_upload_id?: string | null;
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
      : value,
  )
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique((tag: string) => tag.toLocaleLowerCase('ru-RU'))
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  tags: string[];
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProjectAuthorInputDto)
  authors: ProjectAuthorInputDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ProjectLinkInputDto)
  links?: ProjectLinkInputDto[];
  @IsArray()
  @ArrayMaxSize(20)
  @Validate(ProjectHasImageAttachmentConstraint)
  @ValidateNested({ each: true })
  @Type(() => ProjectAttachmentInputDto)
  attachments: ProjectAttachmentInputDto[];
}
export class UpdateProjectDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeProjectSlug(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)
  slug?: string;
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  release_date?: string;
  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  promo?: string | null;
  @IsOptional()
  @IsBoolean()
  hide_owner?: boolean;
  @IsOptional()
  @IsUUID()
  banner_upload_id?: string | null;
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
      : value,
  )
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique((tag: string) => tag.toLocaleLowerCase('ru-RU'))
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  tags?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProjectAuthorInputDto)
  authors?: ProjectAuthorInputDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ProjectLinkInputDto)
  links?: ProjectLinkInputDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Validate(ProjectHasImageAttachmentConstraint)
  @ValidateNested({ each: true })
  @Type(() => ProjectAttachmentInputDto)
  attachments?: ProjectAttachmentInputDto[];
}
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
export class ProjectListQueryDto extends PageQueryDto {
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsNumberString() author_id?: string;
  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  release_from?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  release_to?: string;
  @IsOptional()
  @IsEnum(ProjectListSort)
  sort = ProjectListSort.ReleaseDateDesc;
}
export class MineProjectsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(ProjectRevisionStatus)
  status?: ProjectRevisionStatus;
  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;
}
export class ProjectReviewListQueryDto extends MineProjectsQueryDto {
  @IsOptional() @IsNumberString() owner_id?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
export class PublishProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
export class RequestProjectChangesDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment: string;
}
export class TransferProjectOwnerDto {
  @IsNumberString() owner_id: string;
}
export class ProjectPublicTagDto {
  slug: string;
  name: string;
}
export class ProjectAuthorDto {
  type: ProjectAuthorType;
  discord_user_id?: string;
  name?: string;
  role: string;
}
export class ProjectAttachmentDto {
  type: ProjectAttachmentType;
  url: string;
  upload_id?: string;
}
export class ProjectUploadDto {
  id: string;
  kind: ProjectUploadKind;
  status: ProjectUploadStatus;
  url: string;
}
export class ProjectUploadCreatedDto {
  upload: {
    id: string;
    url: string;
    expires_in_seconds: number;
  };
}
export class ProjectLinkDto {
  icon: string;
  label: string;
  link: string;
}
export class ProjectLikeStateDto {
  liked: boolean;
  likes_count: number;
}
export class ProjectListItemDto {
  id: string;
  slug: string;
  title: string;
  type: ProjectType;
  release_date: string;
  tags: ProjectPublicTagDto[];
  authors: ProjectAuthorDto[];
  thumbnail: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  likes_count: number;
  published_at: Date;
}
export class ProjectListResponseDto {
  items: ProjectListItemDto[];
  total: number;
  limit: number;
  offset: number;
}
export class ProjectCreditsDto {
  owner_id: string | null;
  hide_owner: boolean;
  authors: ProjectAuthorDto[];
}
export class ProjectResourcesDto {
  attachments: ProjectAttachmentDto[];
  links: ProjectLinkDto[];
}
export class ProjectMetadataDto {
  release_date: string;
  type: ProjectType;
  promo: string | null;
  published_at: Date | null;
  updated_at: Date;
}
export class ProjectStatsDto {
  likes_count: number;
}
export class ProjectDetailsDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string | null;
  banner_url: string | null;
  banner_upload_id: string | null;
  tags: ProjectPublicTagDto[];
  credits: ProjectCreditsDto;
  resources: ProjectResourcesDto;
  metadata: ProjectMetadataDto;
  stats: ProjectStatsDto;
}
export class ProjectReviewEventDto {
  id: string;
  revision_id: string;
  action: ProjectReviewAction;
  actor_id: string;
  comment: string | null;
  created_at: Date;
}
export class ProjectWorkflowDto {
  status: ProjectRevisionStatus;
  version: number;
  has_published_version: boolean;
  published_version: number | null;
  review_events: ProjectReviewEventDto[];
}
export class ProjectEditorDto extends ProjectDetailsDto {
  workflow: ProjectWorkflowDto;
}
