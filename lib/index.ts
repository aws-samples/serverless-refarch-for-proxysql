import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import * as ec2 from '@aws-cdk/aws-ec2';
import { DatabaseClusterEngine, DatabaseCluster } from '@aws-cdk/aws-rds';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigatewayv2';
import { Duration } from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as alias from '@aws-cdk/aws-route53-targets';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { PropagatedTagSource } from '@aws-cdk/aws-ecs';

const PROXYSQL_ADMIN_PORT = 6032
const PROXYSQL_TRAFFIC_PORT = 6033
const AURORA_LISTENER_PORT = 3306
const NLB_LISTENER_PORT  = 3306
const PROXYSQL_PRIVATE_ZONE_NAME = 'proxysql.local'
const AURORA_MASTER_USERNAME = 'admin'

export interface DBStackProps {
  readonly vpc: ec2.IVpc;
  readonly instanceType?: ec2.InstanceType;
}

export interface ProxysqlFargateProps extends cdk.StackProps {
  readonly dbcluster?: DB;
  readonly vpc?: ec2.IVpc;
}

export class Infra extends cdk.Construct {
  readonly vpc: ec2.IVpc
  constructor(scope: cdk.Construct, id: string){
    super(scope, id)
    const stack = cdk.Stack.of(this)
    this.vpc = getOrCreateVpc(stack)
  }
}

export class DB extends cdk.Construct {
  readonly dbcluster: DatabaseCluster;
  readonly vpc: ec2.IVpc;
  readonly clusterEndpointHostname: string;
  readonly clusterReadEndpointHostname: string;
  readonly clusterIdentifier: string;

  constructor(scope: cdk.Construct, id: string, props: DBStackProps ) {
    super(scope, id)
    // Aurora
    const dbcluster = new DatabaseCluster(this, 'Database', {
      engine: DatabaseClusterEngine.AURORA,
      masterUser: {
        username: AURORA_MASTER_USERNAME ?? 'admin',
      },
      instanceProps: {
        instanceType: props.instanceType ?? new ec2.InstanceType('t3.small'),
        vpc: props.vpc,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });


    // allow internally from the same security group
    dbcluster.connections.allowInternally(ec2.Port.tcp(AURORA_LISTENER_PORT))
    // allow from the whole vpc cidr 
    dbcluster.connections.allowFrom(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(AURORA_LISTENER_PORT) )

    this.dbcluster = dbcluster
    this.vpc = props.vpc
    this.clusterEndpointHostname = dbcluster.clusterEndpoint.hostname
    this.clusterReadEndpointHostname = dbcluster.clusterReadEndpoint.hostname
    this.clusterIdentifier = dbcluster.clusterIdentifier
    
    printOutput(this, 'clusterEndpointHostname', this.clusterEndpointHostname )
    printOutput(this, 'clusterReadEndpointHostname', this.clusterReadEndpointHostname)
    printOutput(this, 'clusterIdentifier', this.clusterIdentifier)

  }
}

export interface ServerlessDemoProps {
  readonly vpc: ec2.IVpc;
}

export class ServerlessDemo extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ServerlessDemoProps) {
    super(scope ,id);

    // our lambda function
    const handler = new lambda.Function(this, 'LambdaFunc', {
      code: lambda.Code.fromAsset('./lambda/hello_world'),
      runtime: lambda.Runtime.PYTHON_3_7,
      memorySize: 512,
      timeout: Duration.seconds(60),
      handler: 'app.lambda_handler',
      vpc: props.vpc,
      environment: {
        PROXYSQL_HOST: `nlb.${PROXYSQL_PRIVATE_ZONE_NAME}`,
        PROXYSQL_PORT: NLB_LISTENER_PORT ? NLB_LISTENER_PORT.toString() : '3306',
      }
    })

    const api = new apigateway.HttpApi(this, 'APIG', {
      defaultIntegration: new apigateway.LambdaProxyIntegration({
        handler,
      })
    })

    printOutput(this, 'APIGatewayURL', api.url!)
  }
}

export class ProxysqlFargate extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ProxysqlFargateProps) {
    super(scope, id);

    const vpc = props.vpc ?? props.dbcluster?.vpc ?? getOrCreateVpc(this)

    // generate and store MYSQL_USER1_PASSWORD in the secrets manager
    const auroraMasterSecret = new secretsmanager.Secret(this, 'AuroraMasterSecret', {
      secretName: `${cdk.Stack.of(this).stackName}-auroraMasterSecret`,
      generateSecretString: {
        passwordLength: 12,
        excludePunctuation: true, 
      }
    });

    // generate and store RADMIN_PASSWORD in the secrets manager
    const radminSecret = new secretsmanager.Secret(this, 'RAdminPassword', {
      secretName: `${cdk.Stack.of(this).stackName}-radmin_pwd`,
      generateSecretString: {
        passwordLength: 12,
        excludePunctuation: true, 
      }
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    })

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
      environment: {
        DB_WRITER_HOSTNAME: props.dbcluster ? `writer.${PROXYSQL_PRIVATE_ZONE_NAME}` : process.env.DB_WRITER_HOSTNAME ?? 'undefined',
        DB_READER_HOSTNAME: props.dbcluster ? `reader.${PROXYSQL_PRIVATE_ZONE_NAME}` : process.env.DB_READER_HOSTNAME ?? 'undefined',
        DB_WRITER_PORT: process.env.DB_WRITER_PORT ? process.env.DB_WRITER_PORT.toString() : AURORA_LISTENER_PORT.toString(),
        DB_READER_PORT: process.env.DB_READER_PORT ? process.env.DB_READER_PORT.toString() : AURORA_LISTENER_PORT.toString(),
        MYSQL_USER1_NAME: 'mysqluser1',
        AURORA_MASTER_USERNAME,
      },
      secrets: {
        'AURORA_MASTER_PASSWORD': ecs.Secret.fromSecretsManager(auroraMasterSecret),
        'RADMIN_PASSWORD': ecs.Secret.fromSecretsManager(radminSecret),
      }
    })

    // proxysql.addPortMappings({ containerPort: 6032 })
    proxysql.addPortMappings({ containerPort: PROXYSQL_TRAFFIC_PORT })
    proxysql.addPortMappings({ containerPort: PROXYSQL_ADMIN_PORT })

    const svc = new ecsPatterns.NetworkLoadBalancedFargateService(this, 'NLBService', {
      assignPublicIp: true,
      cluster,
      taskDefinition,
      publicLoadBalancer: false,
      // NLB listen on 3306
      listenerPort: NLB_LISTENER_PORT,
    })

    // allow fargate service connect to dbcluster
    props.dbcluster?.dbcluster.connections.allowDefaultPortFrom(svc.service)

    // allow proxysql to listen on tcp 6033 for traffic
    svc.service.connections.allowFrom(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(PROXYSQL_TRAFFIC_PORT))

    // allow vpc cidr to visit proxysql admin port
    svc.service.connections.allowFrom(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(PROXYSQL_ADMIN_PORT))

    svc.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30')
    svc.loadBalancer.setAttribute('load_balancing.cross_zone.enabled', 'true')


    // create route53 alias mapping to the NLB
    const zone = new route53.HostedZone(this, 'ProxySQLHZ', {
      zoneName: PROXYSQL_PRIVATE_ZONE_NAME,
      vpcs: [ vpc ]
    })

    // nlb.proxysql.local ALIAS to the internal NLB
    const ar = new route53.ARecord(this, 'AliasRecord', {
      zone,
      recordName: 'nlb',
      target: route53.RecordTarget.fromAlias(new alias.LoadBalancerTarget(svc.loadBalancer)),
    });

    if(props.dbcluster) {
      // writer.proxysql.local CNAME to Aurora writer
      new route53.CnameRecord(this, 'CnameAuroraWriter', {
        recordName: 'writer',
        domainName: props.dbcluster.clusterEndpointHostname,
        zone,
      })
      // reader.proxysql.local CNAME to Aurora reader
      new route53.CnameRecord(this, 'CnameAuroraReader', {
        recordName: 'reader',
        domainName: props.dbcluster.clusterEndpointHostname,
        zone,
      })

    }

    printOutput(this, 'NLBDnsName', svc.loadBalancer.loadBalancerDnsName)
    printOutput(this, 'NLBAliasDN', ar.domainName)
    printOutput(this, 'ECSClusterName', svc.cluster.clusterName)
    printOutput(this, 'ECSServiceName', svc.service.serviceName)
  }
}

function getOrCreateVpc(scope: cdk.Construct): ec2.IVpc {
  // use an existing vpc or create a new one
  const vpc = scope.node.tryGetContext('use_default_vpc') === '1' ?
    ec2.Vpc.fromLookup(scope, 'Vpc', { isDefault: true }) :
    scope.node.tryGetContext('use_vpc_id') ?
      ec2.Vpc.fromLookup(scope, 'Vpc', { vpcId: scope.node.tryGetContext('use_vpc_id') }) :
      new ec2.Vpc(scope, 'Vpc', { maxAzs: 3, natGateways: 1 });

  return vpc
}

function printOutput(scope: cdk.Construct, id: string, key: string | number) {
  new cdk.CfnOutput(scope, id, { value: String(key) } )
}
