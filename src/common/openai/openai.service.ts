import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import type { CreateEmbeddingResponse } from 'openai/resources/embeddings';
import { Stream } from 'openai/streaming';

@Injectable()
export class OpenAiService {
  constructor(private readonly openai: OpenAI) {}

  async generateChatCompletion(
    params: Omit<ChatCompletionCreateParamsNonStreaming, 'stream'>,
  ): Promise<ChatCompletion> {
    const res = await this.openai.chat.completions.create({
      ...params,
      stream: false,
    });

    return res as ChatCompletion;
  }

  async generateChatCompletionStream(
    params: Omit<ChatCompletionCreateParamsStreaming, 'stream'>,
  ): Promise<Stream<ChatCompletionChunk>> {
    const res = await this.openai.chat.completions.create({
      ...params,
      stream: true,
    });

    return res as Stream<ChatCompletionChunk>;
  }

  async generateEmbedding(
    input: string | Array<string> | Array<number> | Array<Array<number>>,
    options?: {
      model?: string;
      dimensions?: number;
      encodingFormat?: 'float' | 'base64';
    },
  ): Promise<CreateEmbeddingResponse> {
    return this.openai.embeddings.create({
      input,
      model: options?.model ?? 'text-embedding-3-small',
      dimensions: options?.dimensions,
      encoding_format: options?.encodingFormat,
    });
  }
}
