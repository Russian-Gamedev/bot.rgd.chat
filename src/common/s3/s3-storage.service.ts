import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '#config/env';
import { stripTrailingSlash } from '#lib/utils';

export interface S3ObjectHead {
  contentLength: number;
  contentType?: string;
}

@Injectable()
export class S3StorageService {
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly client: S3Client,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.bucket = config.getOrThrow('S3_BUCKET');
    const configuredBaseUrl = config.get('S3_PUBLIC_BASE_URL');
    this.publicBaseUrl = stripTrailingSlash(
      configuredBaseUrl ?? this.derivePublicBaseUrl(config),
    );
  }

  async getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async uploadObject(
    key: string,
    contentType: string,
    body: Uint8Array | Buffer,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        Body: body,
      }),
    );
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async headObject(key: string): Promise<S3ObjectHead | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'NotFound' || error.name === 'NoSuchKey')
      ) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private derivePublicBaseUrl(
    config: ConfigService<EnvironmentVariables>,
  ): string {
    const endpoint = new URL(config.getOrThrow('S3_ENDPOINT'));
    if (config.get('S3_FORCE_PATH_STYLE', true)) {
      return `${endpoint.origin}/${this.bucket}`;
    }
    return `${endpoint.protocol}//${this.bucket}.${endpoint.host}`;
  }
}
