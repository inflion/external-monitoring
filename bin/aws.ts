#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { VpcStack } from '../lib/vpc';
import { InstanceStack } from '../lib/instance';

const props = {
  env: { 
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION 
  }
};

const app = new cdk.App();
const vpcStack = new VpcStack(app, 'ExternalMonitoringVpcStack', props);
const vpcProps = {...props, vpc: vpcStack.getVpc()};

new InstanceStack(app, 'ExternalMonitoringInstanceStack', vpcProps);

app.synth();