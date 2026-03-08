#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { VectorStorageStack } from "../lib/stacks/vector-storage-stack";
import { AuthStack } from "../lib/stacks/auth-stack";
import { ApiStack } from "../lib/stacks/api-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

const vectors = new VectorStorageStack(app, "EnterpriseBrainVectors", { env });
const auth = new AuthStack(app, "EnterpriseBrainAuth", { env });
const api = new ApiStack(app, "EnterpriseBrainApi", {
  env,
  vectorBucketName: vectors.vectorBucketName,
  userPool: auth.userPool,
  userPoolClients: [auth.webClient, auth.cliClient],
});

api.addDependency(vectors);
api.addDependency(auth);
