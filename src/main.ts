import { InstanceType } from '@aws-cdk/aws-ec2';
import { App, Stack } from '@aws-cdk/core';
import { Infra, DB, ProxysqlFargate } from './proxysql';

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

const stack = new Stack(app, 'serverless-proxysql-stack', { env: devEnv });

const infra = new Infra(stack, 'Infra');

const rdscluster = new DB(stack, 'DBCluster', {
  vpc: infra.vpc,
  instanceType: new InstanceType('t2.medium'),
});

new ProxysqlFargate(stack, 'ProxySQL', {
  vpc: infra.vpc,
  rdscluster,
});

app.synth();


