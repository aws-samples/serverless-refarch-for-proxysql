import cdk = require('@aws-cdk/core');
import { Infra, DB, ProxysqlFargate } from '../lib/'
import { InstanceType } from '@aws-cdk/aws-ec2';
import { Secret } from '@aws-cdk/aws-secretsmanager';



const app = new cdk.App()

const env = {
  region: process.env.CDK_DEFAULT_REGION,
  account: process.env.CDK_DEFAULT_ACCOUNT,
};

const stack = new cdk.Stack(app, 'ProxysqlFargateStack', { env })

const infra = new Infra(stack, 'Infra')

const rdscluster = new DB(stack, 'DBCluster', {
  vpc: infra.vpc,
  instanceType: new InstanceType('t2.medium'),
})

new ProxysqlFargate(stack, 'ProxySQL', {
  env,
  vpc: infra.vpc,
  rdscluster,
})


// custom backend
// const YOUR_SECRET_ARN = 'arn:aws:secretsmanager:ap-northeast-1:112233445566:secret:xxxxxxx-rC5RTf'
// const masterSecret = Secret.fromSecretArn(stack, 'Secret', YOUR_SECRET_ARN)
// new ProxysqlFargate(stack, 'ProxySQL', {
//   env,
//   vpc: infra.vpc,
//   customBackend: {
//     writerHost: 'writer.pahud.dev',
//     readerHost: 'reader.pahud.dev',
//     masterSecret,
//   },
// })

// TBD: create a serverless demo stack
// new ServerlessDemo(stack, 'ServerlessDemo', { vpc: infra.vpc })


