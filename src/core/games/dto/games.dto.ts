import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
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
  @ApiProperty({ enum: GameAuthorType })
  @IsEnum(GameAuthorType)
  @Validate(GameAuthorShapeConstraint)
  type: GameAuthorType;
  @ApiPropertyOptional({ example: '123456789012345678' })
  @ValidateIf((o) => o.type === GameAuthorType.Discord)
  @IsNumberString()
  discord_user_id?: string;
  @ApiPropertyOptional({ example: 'Studio Name' })
  @ValidateIf((o) => o.type === GameAuthorType.Text)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class GameLinkInputDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icon: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  link: string;
}

export class GameAttachmentInputDto {
  @ApiProperty({ enum: GameAttachmentType })
  @IsEnum(GameAttachmentType)
  type: GameAttachmentType;
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
}

export class CreateGameDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;
  @ApiPropertyOptional({
    description: 'Editable public URL slug. Defaults to a slug from title.',
    example: 'my-community-game',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeGameSlug(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)
  slug?: string;
  @ApiProperty() @IsString() @MaxLength(20_000) description: string;
  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true })
  release_date: string;
  @ApiProperty({ type: [String], maxItems: 10 })
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
  @ApiProperty({ type: [GameAuthorInputDto], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GameAuthorInputDto)
  authors: GameAuthorInputDto[];
  @ApiPropertyOptional({ type: [GameLinkInputDto], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => GameLinkInputDto)
  links?: GameLinkInputDto[];
  @ApiProperty({ type: [GameAttachmentInputDto], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @Validate(GameHasImageAttachmentConstraint)
  @ValidateNested({ each: true })
  @Type(() => GameAttachmentInputDto)
  attachments: GameAttachmentInputDto[];
}
export class UpdateGameDto extends PartialType(CreateGameDto) {}

export class PageQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
export class GameListQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() author_id?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  release_from?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  release_to?: string;
  @ApiPropertyOptional({
    enum: GameListSort,
    default: GameListSort.ReleaseDateDesc,
  })
  @IsOptional()
  @IsEnum(GameListSort)
  sort = GameListSort.ReleaseDateDesc;
}
export class MineGamesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: GameRevisionStatus })
  @IsOptional()
  @IsEnum(GameRevisionStatus)
  status?: GameRevisionStatus;
}
export class GameReviewListQueryDto extends MineGamesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsNumberString() owner_id?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
export class PublishGameDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
export class RequestGameChangesDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment: string;
}
export class TransferGameOwnerDto {
  @ApiProperty() @IsNumberString() owner_id: string;
}
export class GamePublicTagDto {
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
}
export class GameAuthorDto {
  @ApiProperty({ enum: GameAuthorType }) type: GameAuthorType;
  @ApiPropertyOptional() discord_user_id?: string;
  @ApiPropertyOptional() name?: string;
}
export class GameAttachmentDto {
  @ApiProperty({ enum: GameAttachmentType }) type: GameAttachmentType;
  @ApiProperty() url: string;
}
export class GameLinkDto {
  @ApiProperty() icon: string;
  @ApiProperty() label: string;
  @ApiProperty() link: string;
}
export class GameLikeStateDto {
  @ApiProperty() liked: boolean;
  @ApiProperty() likes_count: number;
}
export class GameListItemDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() release_date: string;
  @ApiProperty({ type: [GamePublicTagDto] }) tags: GamePublicTagDto[];
  @ApiProperty({ type: [GameAuthorDto] }) authors: GameAuthorDto[];
  @ApiPropertyOptional({ nullable: true }) thumbnail: string | null;
  @ApiProperty() likes_count: number;
  @ApiProperty() published_at: Date;
}
export class GameListResponseDto {
  @ApiProperty({ type: [GameListItemDto] }) items: GameListItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() limit: number;
  @ApiProperty() offset: number;
}
export class GameCreditsDto {
  @ApiProperty() owner_id: string;
  @ApiProperty({ type: [GameAuthorDto] }) authors: GameAuthorDto[];
}
export class GameResourcesDto {
  @ApiProperty({ type: [GameAttachmentDto] }) attachments: GameAttachmentDto[];
  @ApiProperty({ type: [GameLinkDto] }) links: GameLinkDto[];
}
export class GameMetadataDto {
  @ApiProperty({ format: 'date' }) release_date: string;
  @ApiPropertyOptional({ nullable: true }) published_at: Date | null;
  @ApiProperty() updated_at: Date;
}
export class GameStatsDto {
  @ApiProperty() likes_count: number;
}
export class GameDetailsDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiPropertyOptional({ nullable: true }) thumbnail: string | null;
  @ApiProperty({ type: [GamePublicTagDto] }) tags: GamePublicTagDto[];
  @ApiProperty({ type: GameCreditsDto }) credits: GameCreditsDto;
  @ApiProperty({ type: GameResourcesDto }) resources: GameResourcesDto;
  @ApiProperty({ type: GameMetadataDto }) metadata: GameMetadataDto;
  @ApiProperty({ type: GameStatsDto }) stats: GameStatsDto;
}
export class GameReviewEventDto {
  @ApiProperty() id: string;
  @ApiProperty() revision_id: string;
  @ApiProperty({ enum: GameReviewAction }) action: GameReviewAction;
  @ApiProperty() actor_id: string;
  @ApiPropertyOptional({ nullable: true }) comment: string | null;
  @ApiProperty() created_at: Date;
}
export class GameWorkflowDto {
  @ApiProperty({ enum: GameRevisionStatus }) status: GameRevisionStatus;
  @ApiProperty() version: number;
  @ApiProperty() has_published_version: boolean;
  @ApiPropertyOptional({ nullable: true }) published_version: number | null;
  @ApiProperty({ type: [GameReviewEventDto] })
  review_events: GameReviewEventDto[];
}
export class GameEditorDto extends GameDetailsDto {
  @ApiProperty({ type: GameWorkflowDto }) workflow: GameWorkflowDto;
}
