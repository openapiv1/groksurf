import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent, ComputerAction } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { ResolutionScaler } from "./resolution";

const INSTRUCTIONS = `
You are Surf, a helpful assistant that can use a computer to help the user with their tasks.
You can use the computer to search the web, write code, and more.

Surf is built by E2B, which provides an open source isolated virtual computer in the cloud made for AI use cases.
This application integrates E2B's desktop sandbox with XAI's Grok API to create an AI agent that can perform tasks
on a virtual computer through natural language instructions.

The screenshots that you receive are from a running sandbox instance, allowing you to see and interact with a real
virtual computer environment in real-time.

Since you are operating in a secure, isolated sandbox micro VM, you can execute most commands and operations without
worrying about security concerns. This environment is specifically designed for AI experimentation and task execution.

The sandbox is based on Ubuntu 22.04 and comes with many pre-installed applications including:
- Firefox browser
- Visual Studio Code
- LibreOffice suite
- Python 3 with common libraries
- Terminal with standard Linux utilities
- File manager (PCManFM)
- Text editor (Gedit)
- Calculator and other basic utilities

IMPORTANT: It is okay to run terminal commands at any point without confirmation, as long as they are required to fulfill the task the user has given. You should execute commands immediately when needed to complete the user's request efficiently.

IMPORTANT: When typing commands in the terminal, ALWAYS send a KEYPRESS ENTER action immediately after typing the command to execute it. Terminal commands will not run until you press Enter.

IMPORTANT: When editing files, prefer to use Visual Studio Code (VS Code) as it provides a better editing experience with syntax highlighting, code completion, and other helpful features.

You have access to computer tools and bash tools to control the desktop environment.
`;

// Hardcoded API keys as requested
const XAI_API_KEY = "xai-AC1DL3HexXQMZ2FY2dTiXtzdlBQ1FREL2JCfnT4N5pg57so0suOgTtYfPU5eZuNTR5ECrlT2nyRMTYcO";
const E2B_API_KEY = "e2b_8a5c7099485b881be08b594be7b7574440adf09c";

export class XAIComputerStreamer implements ComputerInteractionStreamerFacade {
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;

  private client: OpenAI;

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    this.client = new OpenAI({
      apiKey: XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
    this.instructions = INSTRUCTIONS;
  }

  async executeAction(action: ComputerAction): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    switch (action.action) {
      case "screenshot": {
        // Screenshots are handled automatically after each action
        break;
      }
      case "double_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);
        await desktop.doubleClick(x, y);
        break;
      }
      case "left_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);
        await desktop.leftClick(x, y);
        break;
      }
      case "right_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);
        await desktop.rightClick(x, y);
        break;
      }
      case "middle_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);
        await desktop.middleClick(x, y);
        break;
      }
      case "type": {
        await desktop.write(action.text);
        break;
      }
      case "key": {
        await desktop.press(action.text);
        break;
      }
      case "scroll": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);
        
        if (action.scroll_direction === "up") {
          await desktop.scroll("up", action.scroll_amount || 3);
        } else if (action.scroll_direction === "down") {
          await desktop.scroll("down", action.scroll_amount || 3);
        }
        break;
      }
      case "mouse_move": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);
        await desktop.moveMouse(x, y);
        break;
      }
      case "left_click_drag": {
        const [startX, startY] = this.resolutionScaler.scaleToOriginalSpace([
          action.start_coordinate[0],
          action.start_coordinate[1],
        ]);
        const [endX, endY] = this.resolutionScaler.scaleToOriginalSpace([
          action.coordinate[0],
          action.coordinate[1],
        ]);
        await desktop.drag([startX, startY], [endX, endY]);
        break;
      }
      case "wait": {
        const duration = action.duration || 1000;
        await new Promise(resolve => setTimeout(resolve, duration));
        break;
      }
      default: {
        logWarning("Unknown action type:", action.action);
      }
    }
  }

  async executeBashCommand(command: string): Promise<void> {
    try {
      await this.desktop.commands.run(command);
    } catch (error) {
      logError("Error executing bash command:", error);
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"xai">> {
    const { messages, signal } = props;

    try {
      const modelResolution = this.resolutionScaler.getScaledResolution();

      // Tool definitions for XAI Grok
      const tools = [
        {
          type: "function" as const,
          function: {
            name: "computer_action",
            description: "Execute a computer action like clicking, typing, scrolling, etc.",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "screenshot", "left_click", "right_click", "middle_click", 
                    "double_click", "type", "key", "scroll", "mouse_move", 
                    "left_click_drag", "wait"
                  ],
                  description: "The action to perform"
                },
                coordinate: {
                  type: "array",
                  items: { type: "number" },
                  description: "X, Y coordinates for click/move actions"
                },
                start_coordinate: {
                  type: "array", 
                  items: { type: "number" },
                  description: "Start coordinates for drag actions"
                },
                text: {
                  type: "string",
                  description: "Text to type or key to press"
                },
                scroll_direction: {
                  type: "string",
                  enum: ["up", "down", "left", "right"],
                  description: "Direction to scroll"
                },
                scroll_amount: {
                  type: "number",
                  description: "Amount to scroll (default: 3)"
                },
                duration: {
                  type: "number",
                  description: "Duration to wait in milliseconds"
                }
              },
              required: ["action"]
            }
          }
        },
        {
          type: "function" as const,
          function: {
            name: "bash_command",
            description: "Execute a bash command in the terminal",
            parameters: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The bash command to execute"
                }
              },
              required: ["command"]
            }
          }
        }
      ];

      // Tools mapping for function calls
      const toolsMap: Record<string, (args: any) => Promise<any>> = {
        computer_action: (args: any) => this.executeAction(args),
        bash_command: (args: any) => this.executeBashCommand(args.command),
      };

      // Convert messages to OpenAI format and add initial screenshot
      const openAIMessages: any[] = [...messages.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      }))];

      // Take initial screenshot and add it to the first user message
      if (openAIMessages.length > 0) {
        const screenshotData = await this.resolutionScaler.takeScreenshot();
        const screenshotBase64 = Buffer.from(screenshotData).toString("base64");
        
        // Add screenshot to the latest user message
        const latestUserMsgIndex = openAIMessages.map((msg, index) => 
          msg.role === "user" ? index : -1
        ).filter(index => index !== -1).pop();

        if (latestUserMsgIndex !== undefined) {
          openAIMessages[latestUserMsgIndex] = {
            role: "user",
            content: [
              { type: "text", text: openAIMessages[latestUserMsgIndex].content as string },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${screenshotBase64}`
                }
              }
            ]
          };
        }
      }

      let conversationMessages: any[] = [...openAIMessages];

      while (true) {
        if (signal.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        // Create chat completion with streaming
        const stream = await this.client.chat.completions.create({
          model: "grok-2-1212",
          messages: conversationMessages,
          tools: tools,
          tool_choice: "auto",
          stream: true,
          temperature: 0.7,
        });

        let assistantMessage = "";
        let toolCalls: any[] = [];
        let currentToolCall: any = null;

        // Process streaming response
        for await (const chunk of stream) {
          if (signal.aborted) {
            yield {
              type: SSEEventType.DONE,
              content: "Generation stopped by user",
            };
            return;
          }

          const delta = chunk.choices[0]?.delta;
          
          if (delta?.content) {
            assistantMessage += delta.content;
            // Stream reasoning/content in real-time
            yield {
              type: SSEEventType.REASONING,
              content: delta.content,
            };
          }

          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              if (toolCallDelta.index !== undefined) {
                if (!toolCalls[toolCallDelta.index]) {
                  toolCalls[toolCallDelta.index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: { name: "", arguments: "" }
                  };
                }
                
                if (toolCallDelta.function?.name) {
                  toolCalls[toolCallDelta.index].function.name += toolCallDelta.function.name;
                }
                
                if (toolCallDelta.function?.arguments) {
                  toolCalls[toolCallDelta.index].function.arguments += toolCallDelta.function.arguments;
                }
              }
            }
          }
        }

        // If we have tool calls, execute them
        if (toolCalls.length > 0) {
          // Add assistant message with tool calls
          conversationMessages.push({
            role: "assistant",
            content: assistantMessage,
            tool_calls: toolCalls
          });

          for (const toolCall of toolCalls) {
            try {
              const functionName = toolCall.function.name;
              const functionArgs = JSON.parse(toolCall.function.arguments);

              yield {
                type: SSEEventType.ACTION,
                action: functionName === "computer_action" ? functionArgs : { action: "bash", command: functionArgs.command },
              };

              if (functionName in toolsMap) {
                await toolsMap[functionName](functionArgs);
              } else {
                logError(`Function ${functionName} not found in tools map`);
              }

              yield {
                type: SSEEventType.ACTION_COMPLETED,
              };

              // Take screenshot after action
              const screenshotData = await this.resolutionScaler.takeScreenshot();
              const screenshotBase64 = Buffer.from(screenshotData).toString("base64");

              // Add tool result with screenshot
              conversationMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: [
                  {
                    type: "text",
                    text: `Action ${functionName} completed successfully.`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${screenshotBase64}`
                    }
                  }
                ] as any
              });

            } catch (error) {
              logError("Error executing tool call:", error);
              conversationMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Error executing ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}`
              });
            }
          }
        } else {
          // No tool calls, conversation is complete
          if (assistantMessage) {
            conversationMessages.push({
              role: "assistant",
              content: assistantMessage
            });
          }
          
          yield {
            type: SSEEventType.DONE,
            content: assistantMessage,
          };
          break;
        }
      }
    } catch (error) {
      logError("XAI_STREAMER", error);
      yield {
        type: SSEEventType.ERROR,
        content: "An error occurred with the XAI service. Please try again.",
      };
    }
  }
}