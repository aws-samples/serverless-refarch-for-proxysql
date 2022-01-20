import {
  App, Stack,
  aws_ec2 as ec2,
} from 'aws-cdk-lib';
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
  instanceType: new ec2.InstanceType('t2.medium'),
});

new ProxysqlFargate(stack, 'ProxySQL', {
  vpc: infra.vpc,
  rdscluster,
});

app.synth();


