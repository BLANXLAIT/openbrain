import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { getConfig } from "./config.js";

let tokenCache: { token: string; expiresAt: number } | undefined;

export async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const config = await getConfig();
  const cognito = new CognitoIdentityProviderClient({ region: "us-east-1" });

  const res = await cognito.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: config.username,
        PASSWORD: config.password,
      },
    })
  );

  const token = res.AuthenticationResult!.AccessToken!;
  const expiresIn = res.AuthenticationResult!.ExpiresIn! * 1000;
  tokenCache = { token, expiresAt: now + expiresIn };
  return token;
}
