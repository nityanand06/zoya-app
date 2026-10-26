/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConnectionState = "disconnected" | "connecting" | "idle" | "listening" | "speaking" | "error";

export interface ToolCallLog {
  id: string;
  name: string;
  args: {
    url: string;
  };
  timestamp: string;
}

export interface InteractionSession {
  id: string;
  timestamp: Date;
  durationSeconds: number;
}
