#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HyrelogStack } from '../lib/hyrelog-stack';

const app = new cdk.App();

// Get region from context (e.g., --context region=us-east-1)
const region = app.node.tryGetContext('region') || 'us-east-1';

// Map logical regions to AWS regions
const regionMap: Record<string, string> = {
  US: 'us-east-1',
  EU: 'eu-west-1',
  UK: 'eu-west-2',
  AU: 'ap-southeast-2',
};

// Determine logical region from AWS region
const logicalRegion = Object.keys(regionMap).find(
  (key) => regionMap[key] === region
) || 'US';

// Get environment
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: region,
};

// Stack name includes logical region for clarity
new HyrelogStack(app, `HyrelogStack-${logicalRegion}`, {
  env,
  logicalRegion: logicalRegion as 'US' | 'EU' | 'UK' | 'AU',
  awsRegion: region,
  description: `HyreLog API infrastructure for ${logicalRegion} region`,
});

