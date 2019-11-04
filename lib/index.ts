import cdk = require('@aws-cdk/core');
import ecs = require('@aws-cdk/aws-ecs');
import ecsPatterns = require('@aws-cdk/aws-ecs-patterns');
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import { DatabaseClusterEngine, DatabaseCluster } from '@aws-cdk/aws-rds';
import lambda = require('@aws-cdk/aws-lambda');
import apigateway = require('@aws-cdk/aws-apigateway');
import { Duration } from '@aws-cdk/core';
import cloudmap = require('@aws-cdk/aws-servicediscovery');

export class ProxysqlFargate extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true })
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      defaultCloudMapNamespace: {
        name: 'proxysql.local',
        type: cloudmap.NamespaceType.DNS_PRIVATE,
        vpc
      }
    })
    // Aurora
    const dbcluster = new DatabaseCluster(this, 'Database', {
      engine: DatabaseClusterEngine.AURORA,
      masterUser: {
        username: 'admin',
      },
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
        vpc
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    dbcluster.connections.allowInternally(ec2.Port.tcp(3306))

    const taskDefinition = new ecs.TaskDefinition(this, 'Task', {
      compatibility: ecs.Compatibility.FARGATE,
      memoryMiB: '4096',
      cpu: '1024'
    })
    const proxysql = taskDefinition.addContainer('proxysql', {
      image: ecs.ContainerImage.fromAsset('./dockerAssets.d/proxysql'),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'proxysql-main'
      }),
    })

    const bootstrap = taskDefinition.addContainer('bootstrap', {
      image: ecs.ContainerImage.fromAsset('./dockerAssets.d/bootstrap'),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'proxysql-bootstrap'
      }),
      environment: {
        DB_WRITER_HOSTNAME: dbcluster.clusterEndpoint.hostname,
        DB_READER_HOSTNAME: dbcluster.clusterReadEndpoint.hostname,
        DB_WRITER_PORT: dbcluster.clusterEndpoint.port.toString(),
        DB_READER_PORT: dbcluster.clusterReadEndpoint.port.toString(),
      }
    })

    bootstrap.addContainerDependencies({
      container: proxysql,
      condition: ecs.ContainerDependencyCondition.START
    })

    proxysql.addPortMappings({ containerPort: 6032 })
    proxysql.addPortMappings({ containerPort: 6033 })

    const svc = new ecsPatterns.NetworkLoadBalancedFargateService(this, 'NLBService', {
      assignPublicIp: true,
      cluster,
      taskDefinition,
      publicLoadBalancer: false,
      cloudMapOptions: {
        dnsRecordType: cloudmap.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(30),
        name: 'db'
      }
    })

    const cfnEcsService = svc.service.node.findChild('Service') as ecs.CfnService
    // add the RDS security group to Fargate task as additional security group so Fargate can connect to RDS through TCP 3306 internally
    cfnEcsService.addOverride('Properties.NetworkConfiguration.AwsvpcConfiguration.SecurityGroups.1', dbcluster.connections.securityGroups[0].securityGroupId)
    svc.service.connections.allowFromAnyIpv4(ec2.Port.tcp(6032))
    svc.service.connections.allowFromAnyIpv4(ec2.Port.tcp(6033))
    svc.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30')
    svc.loadBalancer.setAttribute('load_balancing.cross_zone.enabled', 'true')
    const cfnListener = svc.listener.node.defaultChild as elbv2.CfnListener
    cfnListener.addOverride('Properties.Port', 6033)

    // our lambda function
    const handler = new lambda.Function(this, 'LambdaFunc', {
      code: lambda.Code.fromAsset('./lambda/hello_world'),
      runtime: lambda.Runtime.PYTHON_3_7,
      memorySize: 512,
      timeout: Duration.seconds(30),
      handler: 'app.lambda_handler',
      vpc,
      environment: {
        PROXY_HOST: 'db.proxysql.local',
        PROXY_PORT: '6033'
      }
    })

    const api = new apigateway.LambdaRestApi(this, 'API', {
      handler
    })
  }
}

const app = new cdk.App()
const env = {
  region: app.node.tryGetContext('region') || process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION,
  account: app.node.tryGetContext('account') || process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT
};

const ProxySQLStack = new ProxysqlFargate(app, 'ProxySQL2', { env })