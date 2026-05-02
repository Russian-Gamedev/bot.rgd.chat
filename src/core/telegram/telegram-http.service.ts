import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Agent } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { EnvironmentVariables } from '#config/env';

import {
  getTelegramProxyAgent,
  getTelegramSocksProxyUrl,
} from './telegram-proxy';

export class TelegramHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`Telegram request failed with status ${statusCode}`);
  }
}

export interface TelegramBinaryResponse {
  contentType: string;
  buffer: Buffer;
}

@Injectable()
export class TelegramHttpService {
  private readonly logger = new Logger(TelegramHttpService.name);

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {}

  async fetchBinary(url: string | URL): Promise<TelegramBinaryResponse> {
    const agent = getTelegramProxyAgent(getTelegramSocksProxyUrl(this.config));
    if (agent) {
      const targetUrl = typeof url === 'string' ? url : url.toString();
      this.logger.log(`Fetching Telegram binary via SOCKS proxy: ${targetUrl}`);
    }
    return fetchTelegramBinary(url, agent);
  }
}

export async function fetchTelegramBinary(
  url: string | URL,
  agent?: Agent,
): Promise<TelegramBinaryResponse> {
  const parsedUrl = typeof url === 'string' ? new URL(url) : url;
  const requestImpl =
    parsedUrl.protocol === 'http:' ? httpRequest : httpsRequest;

  return new Promise((resolve, reject) => {
    const request = requestImpl(parsedUrl, { agent }, (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      response.on('error', reject);
      response.on('end', () => {
        const statusCode = response.statusCode ?? 500;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new TelegramHttpError(statusCode));
          return;
        }

        const contentTypeHeader = response.headers['content-type'];
        const contentType = Array.isArray(contentTypeHeader)
          ? contentTypeHeader[0]
          : (contentTypeHeader ?? 'image/jpeg');

        resolve({
          contentType,
          buffer: Buffer.concat(chunks),
        });
      });
    });

    request.on('error', reject);
    request.end();
  });
}
