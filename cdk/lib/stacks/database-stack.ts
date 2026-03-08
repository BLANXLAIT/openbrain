import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as cr from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export class DatabaseStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly dbSecret: cdk.aws_secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "BrainVpc", {
      maxAzs: 2,
      natGateways: 0,
    });

    this.cluster = new rds.DatabaseCluster(this, "BrainCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      defaultDatabaseName: "brain",
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2("writer"),
      enableDataApi: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.dbSecret = this.cluster.secret!;

    // Custom resource to run schema migration via Data API
    const migrationSql = getSchemaMigrationSql();

    const migration = new cr.AwsCustomResource(this, "SchemaMigration", {
      onCreate: {
        service: "RDSDataService",
        action: "executeStatement",
        parameters: {
          resourceArn: this.cluster.clusterArn,
          secretArn: this.dbSecret.secretArn,
          database: "brain",
          sql: migrationSql,
        },
        physicalResourceId: cr.PhysicalResourceId.of("brain-schema-v1"),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new cdk.aws_iam.PolicyStatement({
          actions: ["rds-data:ExecuteStatement"],
          resources: [this.cluster.clusterArn],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [this.dbSecret.secretArn],
        }),
      ]),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    migration.node.addDependency(this.cluster);

    // Outputs
    new cdk.CfnOutput(this, "ClusterArn", {
      value: this.cluster.clusterArn,
      exportName: "BrainClusterArn",
    });
    new cdk.CfnOutput(this, "SecretArn", {
      value: this.dbSecret.secretArn,
      exportName: "BrainDbSecretArn",
    });
  }
}

function getSchemaMigrationSql(): string {
  // Data API executes single statements, so we use a DO block for the full migration.
  // pgvector extension must be created separately (requires superuser),
  // but Aurora PostgreSQL includes pgvector — just CREATE EXTENSION.
  return `
DO $$
BEGIN
  -- Enable pgvector
  CREATE EXTENSION IF NOT EXISTS vector;

  -- Create visibility enum
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'thought_visibility') THEN
    CREATE TYPE thought_visibility AS ENUM ('private', 'team', 'public');
  END IF;

  -- Create thoughts table
  CREATE TABLE IF NOT EXISTS thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding vector(1024),
    metadata JSONB DEFAULT '{}'::jsonb,
    user_id TEXT NOT NULL,
    team_id TEXT,
    visibility thought_visibility DEFAULT 'private',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  -- Indexes (IF NOT EXISTS supported on indexes in PG 9.5+)
  CREATE INDEX IF NOT EXISTS thoughts_embedding_idx ON thoughts USING hnsw (embedding vector_cosine_ops);
  CREATE INDEX IF NOT EXISTS thoughts_metadata_idx ON thoughts USING gin (metadata jsonb_path_ops);
  CREATE INDEX IF NOT EXISTS thoughts_created_at_idx ON thoughts (created_at DESC);
  CREATE INDEX IF NOT EXISTS thoughts_user_id_idx ON thoughts (user_id);
  CREATE INDEX IF NOT EXISTS thoughts_team_id_idx ON thoughts (team_id);

  -- Auto-update trigger
  CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER AS $fn$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS thoughts_updated_at ON thoughts;
  CREATE TRIGGER thoughts_updated_at
    BEFORE UPDATE ON thoughts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

END$$;
  `.trim();
}
