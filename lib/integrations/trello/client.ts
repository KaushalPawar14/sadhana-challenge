import { createHash } from "node:crypto";
import { buildSafeCardDescription } from "./safeCard";
import type { OperationalCardInput, TrelloCard, TrelloMode } from "./types";

type TrelloConfiguration = {
  mode: TrelloMode;
  apiKey?: string;
  token?: string;
  defaultListId?: string;
  clientIdentifier?: string;
};

export class TrelloOperationalClient {
  constructor(private readonly config: TrelloConfiguration) {}

  async createCard(input: OperationalCardInput): Promise<TrelloCard> {
    const description = buildSafeCardDescription(input);

    if (this.config.mode !== "live") {
      const suffix = createHash("sha256")
        .update(`${input.crmTaskId}:${input.title}`)
        .digest("hex")
        .slice(0, 16);
      return {
        id: `mock-${suffix}`,
        name: input.title,
        url: `https://trello.invalid/mock-${suffix}`,
        idList: this.config.defaultListId ?? "mock-approved-list",
        due: input.dueAt ?? null,
      };
    }

    if (!this.config.apiKey || !this.config.token || !this.config.defaultListId) {
      throw new Error("Live Trello mode is missing server-side credentials or list ID.");
    }

    const params = new URLSearchParams({
      key: this.config.apiKey,
      token: this.config.token,
      idList: this.config.defaultListId,
      name: input.title,
      desc: description,
      pos: "bottom",
    });
    if (input.dueAt) params.set("due", input.dueAt);

    const response = await fetch(`https://api.trello.com/1/cards?${params}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Trello-Client-Identifier":
          this.config.clientIdentifier ?? "folk-surat-crm",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Trello card creation failed with status ${response.status}.`);
    }

    return (await response.json()) as TrelloCard;
  }
}

export function trelloClientFromEnvironment(): TrelloOperationalClient {
  const requestedMode = process.env.TRELLO_MODE;
  const mode: TrelloMode =
    requestedMode === "live" || requestedMode === "test" ? requestedMode : "mock";

  return new TrelloOperationalClient({
    mode,
    apiKey: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_TOKEN,
    defaultListId: process.env.TRELLO_APPROVED_LIST_ID,
    clientIdentifier: process.env.TRELLO_CLIENT_IDENTIFIER,
  });
}
