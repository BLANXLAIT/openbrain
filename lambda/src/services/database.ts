import {
  RDSDataClient,
  ExecuteStatementCommand,
  Field,
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.SECRET_ARN!;
const DATABASE_NAME = process.env.DATABASE_NAME ?? "brain";

interface SqlParams {
  sql: string;
  parameters?: { name: string; value: Field }[];
}

export async function executeStatement({ sql, parameters }: SqlParams) {
  const command = new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: SECRET_ARN,
    database: DATABASE_NAME,
    sql,
    parameters: parameters?.map((p) => ({
      name: p.name,
      value: p.value,
    })),
    includeResultMetadata: true,
    formatRecordsAs: "JSON",
  });

  return client.send(command);
}

// Helper to build a string Field
export function stringField(value: string): Field {
  return { stringValue: value };
}

export function doubleField(value: number): Field {
  return { doubleValue: value };
}

export function longField(value: number): Field {
  return { longValue: value };
}

export function boolField(value: boolean): Field {
  return { booleanValue: value };
}

export function nullField(): Field {
  return { isNull: true };
}

// Parse JSON-formatted results from Data API
export function parseJsonRecords<T>(formattedRecords?: string): T[] {
  if (!formattedRecords) return [];
  return JSON.parse(formattedRecords) as T[];
}
