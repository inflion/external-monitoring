import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as route53 from '@aws-cdk/aws-route53';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as alias from '@aws-cdk/aws-route53-targets';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as targets from '@aws-cdk/aws-elasticloadbalancingv2-targets';
import {VpcStackProps} from './vpc';
import { PolicyStatement } from '@aws-cdk/aws-iam'

// https://awscdk.io/packages/cdk-ec2-key-pair@1.1.0/#/
import { KeyPair } from 'cdk-ec2-key-pair';

export class InstanceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: VpcStackProps) {
    super(scope, id, props);

    if (!props) {
      return;
    }

    const accountId = cdk.Stack.of(this).account;

    // Create the Key Pair
    const key = new KeyPair(this, 'A-Key-Pair', {
        name: 'a-key-pair',
        description: 'This is a Key Pair',
    });

    // To download the private key via AWS cli you can run:
    // aws secretsmanager get-secret-value \
    //  --secret-id ec2-private-key/a-key-pair \
    //  --query SecretString \
    //  --output text

    const role = new iam.Role(this, 'ExternalMonitoringRole', {
      assumedBy: new iam.AccountPrincipal(accountId)
    });

    // Grant read access to the private key to a role or user
    key.grantRead(role)

    const amznLinux = ec2.MachineImage.lookup({name: 'amzn-linux-2-with-docker-*', owners: [accountId]})

    const i = new ec2.Instance(this, 'Monitoring', {
      keyName: key.name,
      instanceType: new ec2.InstanceType('t2.medium'),
      machineImage: amznLinux,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE })
    });

    console.log(i.instanceId);

    const ssmInlinePolicy = new PolicyStatement({
      actions: ['ssm:*'],
      resources: ['*'],
    });

    i.addToRolePolicy(ssmInlinePolicy);

    const permittedIp = process.env.PERMITTED_IP || '127.0.0.1/32';

    const bastion = new ec2.Instance(this, 'Bastion', {
      keyName: key.name,
      instanceType: new ec2.InstanceType('t2.nano'),
      machineImage: ec2.MachineImage.latestAmazonLinux(
        {
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX,
          edition: ec2.AmazonLinuxEdition.STANDARD,
          virtualization: ec2.AmazonLinuxVirt.HVM,
          storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
          cpuType: ec2.AmazonLinuxCpuType.X86_64,
        }
      ),
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC })
    });
    bastion.addToRolePolicy(ssmInlinePolicy);

    const bastionSg = new ec2.SecurityGroup(this, 'BastionSG', { vpc: props.vpc });
    bastionSg.addIngressRule(ec2.Peer.ipv4(permittedIp), ec2.Port.tcp(22));
    bastionSg.addIngressRule(ec2.Peer.ipv4(permittedIp), ec2.Port.icmpPing());
    bastion.addSecurityGroup(bastionSg);

    // allow from bastion.
    i.connections.allowFrom(bastion, ec2.Port.tcp(22), 'allow ssh from bastion');
    i.connections.allowFrom(bastion, ec2.Port.icmpPing(), 'allow icmp from bastion');

    const zone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: 'inflion.com'
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc: props.vpc,
      internetFacing: true,
    });
    const listener = lb.addListener('Listener', {
      port: 80,
      // 'open: true' is the default, you can leave it out if you want. Set it
      // to 'false' and use `listener.connections` if you want to be selective
      // about who can access the load balancer.
      open: true,
    });
    const secureListener = lb.addListener('SecureListener', {
      port: 443,
      open: true,
    })
    const cert = new acm.Certificate(this, 'Certificate', {
      domainName: 'monitoring.inflion.com',
      validation: acm.CertificateValidation.fromDns(zone),
    });
    secureListener.addCertificates('monitor', [cert]);

    const tg = new elbv2.ApplicationTargetGroup(this, 'TG', {
      vpc: props.vpc,
      targetType: elbv2.TargetType.INSTANCE,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [
        new targets.InstanceIdTarget(i.instanceId, 3000),
        // You can also add target by `tg.addTarget()` method.
      ],
    });

    listener.addTargetGroups('tg', {targetGroups: [tg]});
    secureListener.addTargetGroups('stg', {targetGroups: [tg]});

    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', { vpc: props.vpc });
    securityGroup.addIngressRule(ec2.Peer.ipv4(permittedIp), ec2.Port.tcp(80));
    lb.addSecurityGroup(securityGroup);

    new route53.ARecord(this, 'AliasRecord', {
      zone,
      recordName: 'monitoring',
      target: route53.RecordTarget.fromAlias(new alias.LoadBalancerTarget(lb)),
    });

    i.connections.allowFrom(lb, ec2.Port.tcp(3000));
  };
}