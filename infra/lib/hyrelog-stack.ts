import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface HyrelogStackProps extends cdk.StackProps {
  logicalRegion: 'US' | 'EU' | 'UK' | 'AU';
  awsRegion: string;
}

export class HyrelogStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HyrelogStackProps) {
    super(scope, id, props);

    const { logicalRegion, awsRegion } = props;
    const regionSuffix = logicalRegion.toLowerCase();

    // ============================================================
    // VPC
    // ============================================================
    const vpc = new ec2.Vpc(this, `Vpc-${logicalRegion}`, {
      maxAzs: 2,
      natGateways: 1, // For cost optimization, use 1 NAT gateway in Phase 0
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ============================================================
    // ECS Cluster
    // ============================================================
    const cluster = new ecs.Cluster(this, `Cluster-${logicalRegion}`, {
      vpc,
      clusterName: `hyrelog-${regionSuffix}`,
    });

    // ============================================================
    // ECR Repositories
    // ============================================================
    const apiRepo = new ecr.Repository(this, `ApiRepo-${logicalRegion}`, {
      repositoryName: `hyrelog-api-${regionSuffix}`,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 10, // Keep last 10 images
        },
      ],
    });

    const workerRepo = new ecr.Repository(this, `WorkerRepo-${logicalRegion}`, {
      repositoryName: `hyrelog-worker-${regionSuffix}`,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 10,
        },
      ],
    });

    // ============================================================
    // RDS Postgres Database
    // ============================================================
    const dbSubnetGroup = new rds.SubnetGroup(this, `DbSubnetGroup-${logicalRegion}`, {
      vpc,
      description: `Subnet group for HyreLog DB in ${logicalRegion}`,
      subnetGroupName: `hyrelog-db-${regionSuffix}`,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    const database = new rds.DatabaseInstance(this, `Database-${logicalRegion}`, {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO // Start small, scale up in production
      ),
      vpc,
      subnetGroup: dbSubnetGroup,
      databaseName: `hyrelog_${regionSuffix}`,
      credentials: rds.Credentials.fromGeneratedSecret('hyrelog-db-admin', {
        secretName: `hyrelog-db-secret-${regionSuffix}`,
      }),
      multiAz: false, // Single AZ for Phase 0 cost optimization
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
      deletionProtection: false, // Set to true in production
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN in production
    });

    // ============================================================
    // S3 Archive Bucket with Lifecycle Rules
    // ============================================================
    const archiveBucket = new s3.Bucket(this, `ArchiveBucket-${logicalRegion}`, {
      bucketName: `hyrelog-archive-${regionSuffix}-${this.account}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Never delete archive data
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          id: 'ColdStorageTransition',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365), // Move to Glacier after 365 days
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(730), // Move to Deep Archive after 2 years
            },
          ],
        },
      ],
    });

    // ============================================================
    // CloudWatch Log Groups
    // ============================================================
    const apiLogGroup = new logs.LogGroup(this, `ApiLogGroup-${logicalRegion}`, {
      logGroupName: `/hyrelog/api-${regionSuffix}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const workerLogGroup = new logs.LogGroup(this, `WorkerLogGroup-${logicalRegion}`, {
      logGroupName: `/hyrelog/worker-${regionSuffix}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, `VpcId-${logicalRegion}`, {
      value: vpc.vpcId,
      description: `VPC ID for ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `ClusterName-${logicalRegion}`, {
      value: cluster.clusterName,
      description: `ECS Cluster name for ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `ApiRepoUri-${logicalRegion}`, {
      value: apiRepo.repositoryUri,
      description: `ECR Repository URI for API in ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `WorkerRepoUri-${logicalRegion}`, {
      value: workerRepo.repositoryUri,
      description: `ECR Repository URI for Worker in ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `DatabaseEndpoint-${logicalRegion}`, {
      value: database.dbInstanceEndpointAddress,
      description: `RDS Database endpoint for ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `DatabaseSecretArn-${logicalRegion}`, {
      value: database.secret?.secretArn || 'N/A',
      description: `RDS Database secret ARN for ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `ArchiveBucketName-${logicalRegion}`, {
      value: archiveBucket.bucketName,
      description: `S3 Archive bucket name for ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `ApiLogGroupName-${logicalRegion}`, {
      value: apiLogGroup.logGroupName,
      description: `CloudWatch Log Group for API in ${logicalRegion} region`,
    });

    new cdk.CfnOutput(this, `WorkerLogGroupName-${logicalRegion}`, {
      value: workerLogGroup.logGroupName,
      description: `CloudWatch Log Group for Worker in ${logicalRegion} region`,
    });
  }
}

