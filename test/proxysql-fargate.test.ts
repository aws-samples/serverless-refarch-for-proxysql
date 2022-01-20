import {
  App, Stack,
  aws_ec2 as ec2,
  aws_secretsmanager as secretsmanager,
  assertions,
} from 'aws-cdk-lib';
import * as proxysql from '../src/proxysql';

let app: App;
let stack: Stack;

beforeEach(() => {
  app = new App();
  stack = new Stack(app, 'ProxysqlFargateStack');
});

test('create', () => {
  const infra = new proxysql.Infra(stack, 'Infra');
  const rdscluster = new proxysql.DB(stack, 'DBCluster', {
    vpc: infra.vpc,
    instanceType: new ec2.InstanceType('t2.medium'),
  });
  // WHEN
  new proxysql.ProxysqlFargate(stack, 'ProxySQL', {
    vpc: infra.vpc,
    rdscluster,
  });
  const t = assertions.Template.fromStack(stack);
  // THEN
  t.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Scheme: 'internal',
  });
  t.hasResourceProperties('AWS::RDS::DBCluster', {
    Engine: 'aurora',
  });
  t.hasResourceProperties('AWS::Route53::HostedZone', {
    Name: 'proxysql.local.',
  });

});
test('allow custom NLB subnets', () => {
  const infra = new proxysql.Infra(stack, 'Infra');
  const rdscluster = new proxysql.DB(stack, 'DBCluster', {
    vpc: infra.vpc,
    instanceType: new ec2.InstanceType('t2.medium'),
  });
  // WHEN
  new proxysql.ProxysqlFargate(stack, 'ProxySQL', {
    vpc: infra.vpc,
    rdscluster,
    nlbSubnetIds: [
      'subnet-aaa',
      'subnet-bbb',
      'subnet-ccc',
    ],
  });
  // THEN
  const t = assertions.Template.fromStack(stack);
  t.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Subnets: [
      'subnet-aaa',
      'subnet-bbb',
      'subnet-ccc',
    ],
  });
});
test('allow custom secret', () => {
  const infra = new proxysql.Infra(stack, 'Infra');
  new proxysql.DB(stack, 'DBCluster', {
    vpc: infra.vpc,
    instanceType: new ec2.InstanceType('t2.medium'),
  });
  const masterSecret = new secretsmanager.Secret(stack, 'CustomMasterSecret', {
    generateSecretString: {
      passwordLength: 12,
      excludePunctuation: true,
    },
  });

  // WHEN
  new proxysql.ProxysqlFargate(stack, 'ProxySQL', {
    vpc: infra.vpc,
    customBackend: {
      readerHost: 'foo',
      writerHost: 'bar',
      masterSecret,
    },
  });
  // THEN
  const t = assertions.Template.fromStack(stack);
  t.hasResourceProperties('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [
      {
        Environment: [
          {
            Name: 'DB_WRITER_HOSTNAME',
            Value: 'writer.proxysql.local',
          },
          {
            Name: 'DB_READER_HOSTNAME',
            Value: 'reader.proxysql.local',
          },
          {
            Name: 'DB_WRITER_PORT',
            Value: '3306',
          },
          {
            Name: 'DB_READER_PORT',
            Value: '3306',
          },
          {
            Name: 'DB_MASTER_USERNAME',
            Value: 'undefined',
          },
        ],
        Essential: true,
        Image: {
          'Fn::Sub': '${AWS::AccountId}.dkr.ecr.${AWS::Region}.${AWS::URLSuffix}/cdk-hnb659fds-container-assets-${AWS::AccountId}-${AWS::Region}:7944d758998e9fc2feb2ff5a7b5c91ddf44e58a1a28509ff4286b5d38c02465f',
        },
        LogConfiguration: {
          LogDriver: 'awslogs',
          Options: {
            'awslogs-group': {
              Ref: 'ProxySQLTaskproxysqlLogGroup48D393F6',
            },
            'awslogs-stream-prefix': 'proxysql-main',
            'awslogs-region': {
              Ref: 'AWS::Region',
            },
          },
        },
        Name: 'proxysql',
        PortMappings: [
          {
            ContainerPort: 6033,
            Protocol: 'tcp',
          },
          {
            ContainerPort: 6032,
            Protocol: 'tcp',
          },
        ],
        Secrets: [
          {
            Name: 'DB_MASTER_PASSWORD',
            ValueFrom: {
              Ref: 'CustomMasterSecretAF48A9AD',
            },
          },
          {
            Name: 'RADMIN_PASSWORD',
            ValueFrom: {
              Ref: 'ProxySQLRAdminPassword14486454',
            },
          },
        ],
      },
    ],
    Cpu: '1024',
    ExecutionRoleArn: {
      'Fn::GetAtt': [
        'ProxySQLTaskExecutionRole2CF4A9E4',
        'Arn',
      ],
    },
    Family: 'ProxysqlFargateStackProxySQLTaskD0149F36',
    Memory: '4096',
    NetworkMode: 'awsvpc',
    RequiresCompatibilities: [
      'FARGATE',
    ],
    TaskRoleArn: {
      'Fn::GetAtt': [
        'ProxySQLTaskTaskRole55CD68FF',
        'Arn',
      ],
    },
  });
});
