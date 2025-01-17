import { DiffEditorManager } from "../diff/DiffEditorManager";
import { OpenAIClient } from "../openai/OpenAIClient";
import { ConversationModel } from "./ConversationModel";

export type ConversationModelFactoryResult =
  | {
      result: "success";
      conversation: ConversationModel;
      shouldImmediatelyAnswer: boolean;
    }
  | {
      result: "unavailable";
      type?: undefined;
    }
  | {
      result: "unavailable";
      type: "info" | "error";
      message: string;
    };

export type ConversationModelFactory = {
  id: string;
  createConversationModel({
    generateChatId,
    openAIClient,
    updateChatPanel,
    diffEditorManager,
  }: {
    generateChatId(): string;
    openAIClient: OpenAIClient;
    updateChatPanel: () => Promise<void>;
    diffEditorManager: DiffEditorManager;
  }): Promise<ConversationModelFactoryResult>;
};
