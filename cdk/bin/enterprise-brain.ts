#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DatabaseStack } from "../lib/stacks/database-stack";
import { AuthStack } from "../lib/stacks/auth-stack";
import { ApiStack } from "../lib/stacks/api-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

const database = new DatabaseStack(app, "EnterpriseBrainDatabase", { env });
const auth = new AuthStack(app, "EnterpriseBrainAuth", { env });
const api = new ApiStack(app, "EnterpriseBrainApi", {
  env,
  cluster: database.cluster,
  dbSecret: database.dbSecret,
  userPool: auth.userPool,
  userPoolClients: [auth.webClient, auth.cliClient],
});

api.addDependency(database);
api.addDependency(auth);
