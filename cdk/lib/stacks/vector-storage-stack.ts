import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class VectorStorageStack extends cdk.Stack {
  public readonly vectorBucketName: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vectorBucketName = "open-brain-vectors";

    const vectorBucket = new cdk.CfnResource(this, "VectorBucket", {
      type: "AWS::S3Vectors::VectorBucket",
      properties: {
        VectorBucketName: this.vectorBucketName,
      },
    });

    const sharedIndex = new cdk.CfnResource(this, "SharedIndex", {
      type: "AWS::S3Vectors::VectorIndex",
      properties: {
        VectorBucketName: this.vectorBucketName,
        IndexName: "shared",
        DataType: "float32",
        Dimension: 1024,
        DistanceMetric: "cosine",
        MetadataConfiguration: {
          NonFilterableMetadataKeys: [
            "content",
            "action_items",
            "dates_mentioned",
          ],
        },
      },
    });
    sharedIndex.addDependency(vectorBucket);

    new cdk.CfnOutput(this, "VectorBucketName", {
      value: this.vectorBucketName,
      exportName: "BrainVectorBucketName",
    });
  }
}
