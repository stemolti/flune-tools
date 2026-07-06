import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";

import {
  auth,
  UnauthorizedError,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { authPath } from "./paths.js";

/** On-disk shape of `~/.flune/auth/<name>.json`. */
interface StoredAuth {
  redirectUrl?: string;
  clientInformation?: OAuthClientInformationFull | OAuthClientInformation;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  state?: string;
}

function readStored(name: string): StoredAuth {
  try {
    return JSON.parse(readFileSync(authPath(name), "utf8")) as StoredAuth;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function writeStored(name: string, data: StoredAuth): void {
  const target = authPath(name);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, target);
}

export interface FluneOAuthProviderOptions {
  /** Loopback redirect URI for an interactive login; omitted for the proxy. */
  redirectUrl?: string;
  /** Called to send the user to the authorization URL (opens a browser). */
  onRedirect?: (authorizationUrl: URL) => void | Promise<void>;
}

/**
 * OAuth client for a single remote MCP server, backed by
 * `~/.flune/auth/<name>.json`. The MCP SDK drives it: it registers the client
 * (DCR), stores the PKCE verifier and tokens, and refreshes tokens on 401.
 *
 * Two modes:
 *  - interactive (login): `onRedirect` opens a browser to the authorize URL.
 *  - non-interactive (proxy): no `onRedirect`, so a required redirect throws
 *    `UnauthorizedError` telling the user to run `flune login <name>`.
 */
export class FluneOAuthProvider implements OAuthClientProvider {
  private stored: StoredAuth;

  constructor(
    private readonly name: string,
    private readonly options: FluneOAuthProviderOptions = {},
  ) {
    this.stored = readStored(name);
    if (options.redirectUrl) {
      this.stored.redirectUrl = options.redirectUrl;
    }
  }

  get redirectUrl(): string | undefined {
    return this.options.redirectUrl ?? this.stored.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    const redirect = this.redirectUrl;
    return {
      client_name: "flune",
      redirect_uris: redirect ? [redirect] : [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid",
    };
  }

  state(): string {
    if (!this.stored.state) {
      this.stored.state = randomUUID();
      this.persist();
    }
    return this.stored.state;
  }

  clientInformation():
    | OAuthClientInformationFull
    | OAuthClientInformation
    | undefined {
    return this.stored.clientInformation;
  }

  saveClientInformation(
    clientInformation: OAuthClientInformationFull | OAuthClientInformation,
  ): void {
    this.stored.clientInformation = clientInformation;
    this.persist();
  }

  tokens(): OAuthTokens | undefined {
    return this.stored.tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.stored.tokens = tokens;
    this.persist();
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.stored.codeVerifier = codeVerifier;
    this.persist();
  }

  codeVerifier(): string {
    if (!this.stored.codeVerifier) {
      throw new Error(`No PKCE code verifier stored for "${this.name}"`);
    }
    return this.stored.codeVerifier;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.options.onRedirect) {
      await this.options.onRedirect(authorizationUrl);
      return;
    }
    throw new UnauthorizedError(
      `Not authenticated with "${this.name}". Run: flune login ${this.name}`,
    );
  }

  invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): void {
    if (scope === "all") {
      this.stored = { redirectUrl: this.stored.redirectUrl };
    } else if (scope === "tokens") {
      delete this.stored.tokens;
    } else if (scope === "verifier") {
      delete this.stored.codeVerifier;
    } else if (scope === "client") {
      delete this.stored.clientInformation;
    }
    // "discovery" state is not persisted by flune — nothing to clear.
    this.persist();
  }

  private persist(): void {
    writeStored(this.name, this.stored);
  }
}

/**
 * Runs the interactive OAuth login for a remote MCP server: starts a loopback
 * redirect server, drives the SDK auth flow (discovery → DCR → PKCE authorize),
 * opens the browser, catches the redirect, and exchanges the code for tokens.
 */
export async function loginFlow(name: string, serverUrl: string): Promise<void> {
  const loopback = await startLoopbackServer();
  const redirectUrl = `http://127.0.0.1:${loopback.port}/callback`;
  const provider = new FluneOAuthProvider(name, {
    redirectUrl,
    onRedirect: (authorizationUrl) => {
      console.log(
        `If your browser did not open, visit:\n  ${authorizationUrl.toString()}`,
      );
      openBrowser(authorizationUrl.toString());
    },
  });

  try {
    const result = await auth(provider, { serverUrl });
    if (result === "AUTHORIZED") return; // existing tokens were still valid

    const { code, state } = await loopback.waitForCode;
    if (state && state !== provider.state()) {
      throw new Error("OAuth state mismatch — aborting for safety");
    }

    const finished = await auth(provider, {
      serverUrl,
      authorizationCode: code,
    });
    if (finished !== "AUTHORIZED") {
      throw new Error(`Authorization did not complete (status: ${finished})`);
    }
  } finally {
    loopback.close();
  }
}

interface Loopback {
  port: number;
  waitForCode: Promise<{ code: string; state?: string }>;
  close: () => void;
}

function startLoopbackServer(): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    let resolveCode!: (value: { code: string; state?: string }) => void;
    let rejectCode!: (err: Error) => void;
    const waitForCode = new Promise<{ code: string; state?: string }>(
      (res, rej) => {
        resolveCode = res;
        rejectCode = rej;
      },
    );

    const server: HttpServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? undefined;

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset=utf-8><title>flune</title>" +
          "<body style=\"font-family:system-ui;padding:3rem\">" +
          (error
            ? `<h2>Authentication failed</h2><p>${error}</p>`
            : "<h2>flune: authentication complete</h2>" +
              "<p>You can close this window and return to the terminal.</p>") +
          "</body>",
      );

      if (error) {
        rejectCode(new Error(`Authorization error: ${error}`));
      } else if (!code) {
        rejectCode(new Error("No authorization code returned"));
      } else {
        resolveCode({ code, state });
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        port: address.port,
        waitForCode,
        close: () => server.close(),
      });
    });
  });
}

/** Best-effort open of a URL in the user's default browser. */
function openBrowser(url: string): void {
  const platform = process.platform;
  const [command, args] =
    platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command as string, args as string[], {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {
      /* the URL is printed too, so a failed launcher is not fatal */
    });
    child.unref();
  } catch {
    /* ignore — the user can open the printed URL manually */
  }
}
