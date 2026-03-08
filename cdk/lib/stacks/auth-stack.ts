import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly webClient: cognito.UserPoolClient;
  public readonly cliClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Enforce @helix.com email domain at sign-up time.
    // This trigger also runs for federated sign-ins (Duo SAML/OIDC), providing
    // a consistent domain gate before and after federation is added.
    const preSignUpFn = new lambda.Function(this, "PreSignUpFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(
        [
          "exports.handler = async (event) => {",
          "  const email = (event.request.userAttributes.email || '').toLowerCase();",
          "  if (!email.endsWith('@helix.com')) {",
          "    throw new Error('Only @helix.com accounts are permitted.');",
          "  }",
          "  return event;",
          "};",
        ].join("\n")
      ),
    });

    this.userPool = new cognito.UserPool(this, "BrainUserPool", {
      userPoolName: "enterprise-brain-users",
      // Self sign-up is disabled: accounts are admin-created or provisioned via Duo federation.
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      customAttributes: {
        // Used for team-scoped thought sharing.
        // When Duo federation is configured, map this from the SAML group/team assertion.
        team_id: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lambdaTriggers: {
        preSignUp: preSignUpFn,
      },
    });

    // TODO: Add Duo federation when ready.
    // new cognito.UserPoolIdentityProviderSaml(this, "DuoSaml", {
    //   userPool: this.userPool,
    //   name: "Duo",
    //   metadata: cognito.UserPoolIdentityProviderSamlMetadata.url("https://..."),
    //   attributeMapping: {
    //     email: cognito.ProviderAttribute.other("mail"),
    //     custom: { "custom:team_id": cognito.ProviderAttribute.other("team") },
    //   },
    // });
    // Also add the IdP to both app clients' supportedIdentityProviders and
    // enable a hosted UI domain for the SAML redirect flow.

    const readAttributes = new cognito.ClientAttributes()
      .withStandardAttributes({ email: true, emailVerified: true })
      .withCustomAttributes("team_id");

    // Web client (browser / future hosted UI)
    this.webClient = this.userPool.addClient("WebClient", {
      userPoolClientName: "brain-web",
      authFlows: {
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      readAttributes,
    });

    // CLI client (Claude Code, curl, etc.) — longer token lifetime for dev use
    this.cliClient = this.userPool.addClient("CliClient", {
      userPoolClientName: "brain-cli",
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(8),
      idTokenValidity: cdk.Duration.hours(8),
      refreshTokenValidity: cdk.Duration.days(90),
      readAttributes,
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: "BrainUserPoolId",
    });
    new cdk.CfnOutput(this, "WebClientId", {
      value: this.webClient.userPoolClientId,
      exportName: "BrainWebClientId",
    });
    new cdk.CfnOutput(this, "CliClientId", {
      value: this.cliClient.userPoolClientId,
      exportName: "BrainCliClientId",
    });
  }
}
