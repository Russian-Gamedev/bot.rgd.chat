import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
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
import { normalizeGameSlug } from '../games.slug';
import {
  GameAttachmentType,
  GameAuthorType,
  GameListSort,
  GameReviewAction,
  GameRevisionStatus,
} from '../games.types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
interface GameAuthorShape {
  type: GameAuthorType;
  discord_user_id?: string;
  name?: string;
}
@ValidatorConstraint({ name: 'gameAuthorShape' })
class GameAuthorShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments) {
    if (!args) return false;
    const author = args.object as GameAuthorShape;
    return author.type === GameAuthorType.Discord
      ? author.discord_user_id !== undefined && author.name === undefined
      : author.type === GameAuthorType.Text
        ? author.name !== undefined && author.discord_user_id === undefined
        : false;
  }
  defaultMessage() {
    return 'discord authors require only discord_user_id; text authors require only name';
  }
}
@ValidatorConstraint({ name: 'gameHasImageAttachment' })
class GameHasImageAttachmentConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      Array.isArray(value) &&
      value.some(
        (attachment) =>
          attachment &&
          typeof attachment === 'object' &&
          'type' in attachment &&
          attachment.type === GameAttachmentType.Image,
      )
    );
  }
  defaultMessage() {
    return 'At least one image attachment is required.';
  }
}
export class GameAuthorInputDto {
  @IsEnum(GameAuthorType)
  @Validate(GameAuthorShapeConstraint)
  type: GameAuthorType;
  @ValidateIf((o) => o.type === GameAuthorType.Discord)
  @IsNumberString()
  discord_user_id?: string;
  @ValidateIf((o) => o.type === GameAuthorType.Text)
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
export class GameLinkInputDto {
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
export class GameAttachmentInputDto {
  @IsEnum(GameAttachmentType)
  type: GameAttachmentType;
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
}
export class CreateGameDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeGameSlug(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)
  slug?: string;
  @IsString() @MaxLength(20_000) description: string;
  @IsDateString({ strict: true })
  release_date: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  promo?: string | null;
  @IsOptional()
  @IsBoolean()
  hide_owner?: boolean;
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
  @Type(() => GameAuthorInputDto)
  authors: GameAuthorInputDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => GameLinkInputDto)
  links?: GameLinkInputDto[];
  @IsArray()
  @ArrayMaxSize(20)
  @Validate(GameHasImageAttachmentConstraint)
  @ValidateNested({ each: true })
  @Type(() => GameAttachmentInputDto)
  attachments: GameAttachmentInputDto[];
}
export class UpdateGameDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeGameSlug(value) : value,
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
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  promo?: string | null;
  @IsOptional()
  @IsBoolean()
  hide_owner?: boolean;
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
  @Type(() => GameAuthorInputDto)
  authors?: GameAuthorInputDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => GameLinkInputDto)
  links?: GameLinkInputDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Validate(GameHasImageAttachmentConstraint)
  @ValidateNested({ each: true })
  @Type(() => GameAttachmentInputDto)
  attachments?: GameAttachmentInputDto[];
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
export class GameListQueryDto extends PageQueryDto {
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsNumberString() author_id?: string;
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
  @IsEnum(GameListSort)
  sort = GameListSort.ReleaseDateDesc;
}
export class MineGamesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(GameRevisionStatus)
  status?: GameRevisionStatus;
}
export class GameReviewListQueryDto extends MineGamesQueryDto {
  @IsOptional() @IsNumberString() owner_id?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
export class PublishGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
export class RequestGameChangesDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment: string;
}
export class TransferGameOwnerDto {
  @IsNumberString() owner_id: string;
}
export class GamePublicTagDto {
  slug: string;
  name: string;
}
export class GameAuthorDto {
  type: GameAuthorType;
  discord_user_id?: string;
  name?: string;
  role: string;
}
export class GameAttachmentDto {
  type: GameAttachmentType;
  url: string;
}
export class GameLinkDto {
  icon: string;
  label: string;
  link: string;
}
export class GameLikeStateDto {
  liked: boolean;
  likes_count: number;
}
export class GameListItemDto {
  id: string;
  slug: string;
  title: string;
  release_date: string;
  tags: GamePublicTagDto[];
  authors: GameAuthorDto[];
  thumbnail: string | null;
  likes_count: number;
  published_at: Date;
}
export class GameListResponseDto {
  items: GameListItemDto[];
  total: number;
  limit: number;
  offset: number;
}
export class GameCreditsDto {
  owner_id: string | null;
  hide_owner: boolean;
  authors: GameAuthorDto[];
}
export class GameResourcesDto {
  attachments: GameAttachmentDto[];
  links: GameLinkDto[];
}
export class GameMetadataDto {
  release_date: string;
  promo: string | null;
  published_at: Date | null;
  updated_at: Date;
}
export class GameStatsDto {
  likes_count: number;
}
export class GameDetailsDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: GamePublicTagDto[];
  credits: GameCreditsDto;
  resources: GameResourcesDto;
  metadata: GameMetadataDto;
  stats: GameStatsDto;
}
export class GameReviewEventDto {
  id: string;
  revision_id: string;
  action: GameReviewAction;
  actor_id: string;
  comment: string | null;
  created_at: Date;
}
export class GameWorkflowDto {
  status: GameRevisionStatus;
  version: number;
  has_published_version: boolean;
  published_version: number | null;
  review_events: GameReviewEventDto[];
}
export class GameEditorDto extends GameDetailsDto {
  workflow: GameWorkflowDto;
}
