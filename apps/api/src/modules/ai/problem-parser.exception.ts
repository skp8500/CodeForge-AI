import { BadRequestException } from '@nestjs/common';

/**
 * Thrown when the AI parser fails to produce a valid structured result
 * after exhausting all retries. The raw OpenAI response is attached so
 * callers can inspect what was actually returned.
 */
export class ParsingException extends BadRequestException {
  constructor(
    message: string,
    /** Raw string content from OpenAI (truncated to 2 KB for the response body) */
    public readonly rawResponse: string,
  ) {
    super({
      message,
      rawResponse: rawResponse.slice(0, 2048),
    });
    this.name = 'ParsingException';
  }
}
