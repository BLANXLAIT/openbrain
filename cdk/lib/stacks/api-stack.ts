import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as rds from "aws-cdk-lib/aws-rds";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

interface ApiStackProps extends cdk.StackProps {
  cluster: rds.DatabaseCluster;
  dbSecret: secretsmanager.ISecret;
  userPool: cognito.UserPool;
  userPoolClients: cognito.UserPoolClient[];
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigwv2.HttpApi;
  public readonly handler: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { cluster, dbSecret, userPool, userPoolClients } = props;

    // Lambda function
    this.handler = new lambdaNode.NodejsFunction(this, "McpHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "..", "..", "lambda", "src", "index.ts"),
      handler: "handler",
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        SECRET_ARN: dbSecret.secretArn,
        DATABASE_NAME: "brain",
        EMBEDDING_MODEL_ID: "amazon.titan-embed-text-v2:0",
        METADATA_MODEL_ID: "anthropic.claude-3-haiku-20240307-v1:0",
      },
      bundling: {
        externalModules: ["@aws-sdk/*"],
        minify: true,
        sourceMap: true,
      },
    });

    // IAM permissions
    dbSecret.grantRead(this.handler);

    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
        ],
        resources: [cluster.clusterArn],
      })
    );

    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      })
    );

    // JWT authorizer
    const authorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      "CognitoAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: userPoolClients.map((c) => c.userPoolClientId),
        identitySource: ["$request.header.Authorization"],
      }
    );

    // HTTP API
    this.api = new apigwv2.HttpApi(this, "BrainApi", {
      apiName: "enterprise-brain-mcp",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.GET],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const integration = new apigwv2Integrations.HttpLambdaIntegration(
      "McpIntegration",
      this.handler
    );

    // Authenticated route
    this.api.addRoutes({
      path: "/mcp",
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer,
    });

    // Health check (no auth)
    this.api.addRoutes({
      path: "/mcp",
      methods: [apigwv2.HttpMethod.GET],
      integration,
    });

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.api.apiEndpoint,
      exportName: "BrainApiUrl",
    });
  }
}
