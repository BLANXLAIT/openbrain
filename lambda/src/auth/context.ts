import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { UserContext } from "../types";

export function extractUserContext(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): UserContext {
  const claims = event.requestContext.authorizer.jwt.claims;
  const userId = claims.sub as string;
  const teamId = (claims["custom:team_id"] as string) || undefined;

  return { userId, teamId };
}
