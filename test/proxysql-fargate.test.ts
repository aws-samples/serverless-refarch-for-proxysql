import '@aws-cdk/assert/jest';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as proxysql from '../lib';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';



let app: cdk.App;
let stack: cdk.Stack;

beforeEach(() => {
  app = new cdk.App()
  stack = new cdk.Stack(app, 'ProxysqlFargateStack')
});

test('create', () => {
    const infra = new proxysql.Infra(stack, 'Infra')
    const rdscluster = new proxysql.DB(stack, 'DBCluster', {
      vpc: infra.vpc,
      instanceType: new ec2.InstanceType('t2.medium'),
    })
    // WHEN
    new proxysql.ProxysqlFargate(stack, 'ProxySQL', {
      vpc: infra.vpc,
      rdscluster,
    })
    // THEN
  expect(stack).toHaveResourceLike('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Scheme: 'internal',
  })
  expect(stack).toHaveResourceLike('AWS::RDS::DBCluster', {
    Engine: 'aurora',
  })
  expect(stack).toHaveResourceLike('AWS::Route53::HostedZone', {
    Name: 'proxysql.local.',
  })


});
test('allow custom NLB subnets', () => {
  const infra = new proxysql.Infra(stack, 'Infra')
  const rdscluster = new proxysql.DB(stack, 'DBCluster', {
    vpc: infra.vpc,
    instanceType: new ec2.InstanceType('t2.medium'),
  })
  // WHEN
  new proxysql.ProxysqlFargate(stack, 'ProxySQL', {
    vpc: infra.vpc,
    rdscluster,
    nlbSubnetIds: [
      'subnet-aaa',
      'subnet-bbb',
      'subnet-ccc',
    ]
  })
  // THEN
  expect(stack).toHaveResourceLike('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Subnets: [
      'subnet-aaa',
      'subnet-bbb',
      'subnet-ccc',
    ]
  })
});
test('allow custom secret', () => {
  const infra = new proxysql.Infra(stack, 'Infra')
  const rdscluster = new proxysql.DB(stack, 'DBCluster', {
    vpc: infra.vpc,
    instanceType: new ec2.InstanceType('t2.medium'),
  })
  const masterSecret = new secretsmanager.Secret(stack, 'CustomMasterSecret', {
    generateSecretString: {
      passwordLength: 12,
      excludePunctuation: true,
    }
  });
  
  // WHEN
  new proxysql.ProxysqlFargate(stack, 'ProxySQL', {
    vpc: infra.vpc,
    customBackend: {
      readerHost: 'foo',
      writerHost: 'bar',
      masterSecret,
    }
  })
  // THEN
  expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [
      {
        Secrets: [
          {
            Name: 'DB_MASTER_PASSWORD',
            ValueFrom: {
              Ref: 'CustomMasterSecretAF48A9AD'
            }
          },
          {
            Name: 'RADMIN_PASSWORD',
            ValueFrom: {
              Ref: 'ProxySQLRAdminPassword14486454',
            }
          }
        ]
      }
    ]
  })
});
