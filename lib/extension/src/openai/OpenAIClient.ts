import axios, { AxiosError } from "axios";
import zod, { Schema } from "zod";
import { ApiKeyManager } from "./ApiKeyManager";

export const OpenAICompletionSchema = zod.object({
  id: zod.string(),
  object: zod.literal("text_completion"),
  created: zod.number(),
  model: zod.string(),
  choices: zod
    .array(
      zod.object({
        text: zod.string(),
        index: zod.number(),
        logprobs: zod.nullable(zod.any()),
        finish_reason: zod.string(),
      })
    )
    .length(1),
  usage: zod.object({
    prompt_tokens: zod.number(),
    completion_tokens: zod.number(),
    total_tokens: zod.number(),
  }),
});

export class OpenAIClient {
  private readonly apiKeyManager: ApiKeyManager;

  constructor({ apiKeyManager }: { apiKeyManager: ApiKeyManager }) {
    this.apiKeyManager = apiKeyManager;
  }

  private getApiKey() {
    return this.apiKeyManager.getOpenAIApiKey();
  }

  private async postToApi<T>({
    path,
    content,
    schema,
  }: {
    path: string;
    content: unknown;
    schema: Schema<T>;
  }): Promise<
    | {
        type: "success";
        data: T;
      }
    | {
        type: "error";
        errorMessage: string;
      }
  > {
    try {
      const apiKey = await this.getApiKey();

      if (apiKey == undefined) {
        return {
          type: "error",
          errorMessage:
            "No OpenAI API key found. Please enter your OpenAI API key with the 'Rubberduck: Enter OpenAI API key' command.",
        };
      }

      const response = await axios.post(
        `https://api.openai.com${path}`,
        content,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      return {
        type: "success",
        data: schema.parse(response.data),
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        // extract error message from OpenAI response:
        const message: string | undefined = error.response?.data.error.message;

        return {
          type: "error",
          errorMessage: message ?? "Unknown error",
        };
      }

      return {
        type: "error",
        errorMessage: "Unknown error",
      };
    }
  }

  async generateCompletion({
    prompt,
    maxTokens,
    stop,
  }: {
    prompt: string;
    maxTokens: number;
    stop?: string[] | undefined;
  }) {
    const result = await this.postToApi({
      path: `/v1/completions`,
      content: {
        model: "text-davinci-003",
        prompt,
        max_tokens: maxTokens,
        stop,
        temperature: 0,
        // top_p is excluded because temperature is set
        best_of: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      },
      schema: OpenAICompletionSchema,
    });

    return result.type === "error"
      ? result
      : ({
          type: "success",
          content: result.data.choices[0].text,
        } as const);
  }
}
