import type { GolderMediaStatus } from '../entities/golder-media.entity';

export interface GolderMediaDto {
  id: string;
  name: string;
  slug: string;
  tags: string[];
  url: string;
  contentType: string;
  sizeBytes: string;
  status: GolderMediaStatus;
  uploadedBy: string;
  uploadedByUsername: string | null;
  uploadedByAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GolderUploadDto {
  media: GolderMediaDto;
  upload: {
    url: string;
    expiresInSeconds: number;
  };
}

export interface GolderMediaListDto {
  items: GolderMediaDto[];
  total: number;
}

export interface GolderImportResultDto {
  items: GolderMediaDto[];
}
