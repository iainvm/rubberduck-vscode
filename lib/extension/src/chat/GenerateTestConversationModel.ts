import * as vscode from "vscode";
import { OpenAIClient } from "../openai/OpenAIClient";
import { getActiveEditor } from "../vscode/getActiveEditor";
import { ConversationModel } from "./ConversationModel";
import { ConversationModelFactoryResult } from "./ConversationModelFactory";
import { generateGenerateTestCompletion } from "./generateGenerateTestCompletion";
import { generateRefineCodeCompletion } from "./generateRefineCodeCompletion";

export class GenerateTestConversationModel extends ConversationModel {
  static id = "generateTest";

  static async createConversationModel({
    generateChatId,
    openAIClient,
    updateChatPanel,
  }: {
    generateChatId: () => string;
    openAIClient: OpenAIClient;
    updateChatPanel: () => Promise<void>;
  }): Promise<ConversationModelFactoryResult> {
    const activeEditor = getActiveEditor();

    if (activeEditor == undefined) {
      return {
        result: "unavailable",
        type: "info",
        message: "No active editor",
      };
    }

    const document = activeEditor.document;
    const range = activeEditor.selection;
    const selectedText = document.getText(range);

    if (selectedText.trim().length === 0) {
      return {
        result: "unavailable",
        type: "info",
        message: "No selected text.",
      };
    }

    return {
      result: "success",
      conversation: new GenerateTestConversationModel(
        {
          id: generateChatId(),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          filename: document.fileName.split("/").pop()!,
          range,
          selectedText,
          language: activeEditor.document.languageId,
        },
        {
          openAIClient,
          updateChatPanel,
        }
      ),
      shouldImmediatelyAnswer: true,
    };
  }

  readonly filename: string;
  readonly range: vscode.Range;
  readonly selectedText: string;
  readonly language: string | undefined;

  testContent: string | undefined;
  testDocument: vscode.TextDocument | undefined;
  testEditor: vscode.TextEditor | undefined;

  constructor(
    {
      id,
      filename,
      range,
      selectedText,
      language,
    }: {
      id: string;
      filename: string;
      range: vscode.Range;
      selectedText: string;
      language: string | undefined;
    },
    {
      openAIClient,
      updateChatPanel,
    }: {
      openAIClient: OpenAIClient;
      updateChatPanel: () => Promise<void>;
    }
  ) {
    super({
      id,
      initialState: {
        type: "waitingForBotAnswer",
        botAction: "Generating test",
      },
      openAIClient,
      updateChatPanel,
    });

    this.filename = filename;
    this.range = range;
    this.selectedText = selectedText;
    this.language = language;
  }

  getTitle(): string {
    return `Generate Test (${this.filename} ${this.range.start.line}:${this.range.end.line})`;
  }

  isTitleMessage(): boolean {
    return false;
  }

  getCodicon(): string {
    return "beaker";
  }

  private async updateEditor() {
    const testContent = this.testContent;

    if (testContent == undefined) {
      return;
    }

    // introduce local variable to ensure that testDocument is defined:
    const testDocument =
      this.testDocument ??
      (await vscode.workspace.openTextDocument({
        language: this.language,
        content: testContent,
      }));

    this.testDocument = testDocument;

    if (this.testEditor == undefined) {
      this.testEditor = await vscode.window.showTextDocument(
        testDocument,
        vscode.ViewColumn.Beside
      );
    } else {
      this.testEditor.edit((edit: vscode.TextEditorEdit) => {
        edit.replace(
          new vscode.Range(
            testDocument.positionAt(0),
            testDocument.positionAt(testDocument.getText().length - 1)
          ),
          testContent
        );
      });
    }
  }

  async executeGenerateTest(userMessage?: string) {
    const completion =
      userMessage != undefined && this.testContent != null
        ? await generateRefineCodeCompletion({
            code: this.testContent,
            instruction: userMessage,
            openAIClient: this.openAIClient,
          })
        : await generateGenerateTestCompletion({
            selectedText: this.selectedText,
            openAIClient: this.openAIClient,
          });

    if (completion.type === "error") {
      await this.setErrorStatus({ errorMessage: completion.errorMessage });
      return;
    }

    this.testContent = completion.content.trim();

    await this.addBotMessage({
      content: userMessage != undefined ? "Test updated." : "Test generated.",
      responsePlaceholder: "Instruct how to refine the test…",
    });

    await this.updateEditor();
  }

  async retry() {
    const userMessages = this.messages.filter(
      (message) => message.author === "user"
    );

    const userMessage = userMessages[userMessages.length - 1]?.content;

    this.state = {
      type: "waitingForBotAnswer",
      botAction: userMessage != undefined ? "Test updated." : "Test generated.",
    };
    await this.updateChatPanel();

    await this.executeGenerateTest(userMessage);
  }

  async answer(userMessage?: string) {
    if (userMessage != undefined) {
      await this.addUserMessage({
        content: userMessage,
        botAction: "Updating Test",
      });
    }

    await this.executeGenerateTest(userMessage);
  }
}
