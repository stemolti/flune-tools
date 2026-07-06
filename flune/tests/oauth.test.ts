import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FluneOAuthProvider } from "../src/core/oauth.js";
import { authPath } from "../src/core/paths.js";
import { makeTempFluneHome, removeTempFluneHome } from "./helpers.js";

describe("oauth provider", () => {
  let home: string;

  beforeEach(async () => {
    home = await makeTempFluneHome();
  });

  afterEach(async () => {
    await removeTempFluneHome(home);
  });

  it("persists tokens and reloads them in a fresh instance", async () => {
    const provider = new FluneOAuthProvider("mobbin");
    provider.saveTokens({
      access_token: "at-123",
      token_type: "Bearer",
      refresh_token: "rt-456",
    });

    const reloaded = new FluneOAuthProvider("mobbin");
    expect(reloaded.tokens()).toMatchObject({
      access_token: "at-123",
      refresh_token: "rt-456",
    });
    expect(readFileSync(authPath("mobbin"), "utf8")).toContain("at-123");
  });

  it("returns undefined tokens when nothing is stored", () => {
    const provider = new FluneOAuthProvider("nobody");
    expect(provider.tokens()).toBeUndefined();
  });

  it("round-trips PKCE verifier and client information", () => {
    const provider = new FluneOAuthProvider("mobbin");
    provider.saveCodeVerifier("verifier-abc");
    provider.saveClientInformation({
      client_id: "client-xyz",
      redirect_uris: ["http://127.0.0.1:9999/callback"],
    });

    const reloaded = new FluneOAuthProvider("mobbin");
    expect(reloaded.codeVerifier()).toBe("verifier-abc");
    expect(reloaded.clientInformation()).toMatchObject({
      client_id: "client-xyz",
    });
  });

  it("throws an actionable error when a redirect is needed non-interactively", async () => {
    const provider = new FluneOAuthProvider("mobbin");
    await expect(
      provider.redirectToAuthorization(new URL("https://example.com/authorize")),
    ).rejects.toThrow(/flune login mobbin/);
  });

  it("invalidates only the requested credential scope", () => {
    const provider = new FluneOAuthProvider("mobbin");
    provider.saveTokens({ access_token: "at", token_type: "Bearer" });
    provider.saveCodeVerifier("v");
    provider.invalidateCredentials("tokens");

    const reloaded = new FluneOAuthProvider("mobbin");
    expect(reloaded.tokens()).toBeUndefined();
    expect(reloaded.codeVerifier()).toBe("v");
  });
});
