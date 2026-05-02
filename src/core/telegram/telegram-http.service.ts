import { Injectable } from '@nestjs/common';

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
  async fetchBinary(url: string | URL): Promise<TelegramBinaryResponse> {
    return fetchTelegramBinary(url);
  }
}

export async function fetchTelegramBinary(
  url: string | URL,
): Promise<TelegramBinaryResponse> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new TelegramHttpError(response.status);
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';

  return {
    contentType,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}
