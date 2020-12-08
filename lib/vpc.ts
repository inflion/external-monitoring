import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export interface VpcStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class VpcStack extends cdk.Stack {
    private vpc: ec2.Vpc;
  
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);

      const allocationIds: string[] = [];
      const eips: string[] = [];

      const numberOfAz = 2;
  
      this.vpc = new ec2.Vpc(this, 'ExternalMonitoringVpc', {
        cidr: '172.16.0.0/16',
        maxAzs: numberOfAz,
        subnetConfiguration: [
          {
            name: 'ingress',
            subnetType: ec2.SubnetType.PUBLIC,
            cidrMask: 24,
          },
          {
            name: 'application_1',
            subnetType: ec2.SubnetType.PRIVATE,
            cidrMask: 24,
          },
          {
            name: 'application_2',
            subnetType: ec2.SubnetType.PRIVATE,
            cidrMask: 24,
            reserved: true,
          },
          {
            name: 'database',
            subnetType: ec2.SubnetType.ISOLATED,
            cidrMask: 24,
          },
        ],
      });

      // Create as many EIP as there are AZ/Subnets and store their allocIds & refs.
      for (let i = 0; i < numberOfAz; i++) {
          var eip = new ec2.CfnEIP(this, `VPCPublicSubnet${i+1}NATGatewayEIP${i}`, {
              domain: 'vpc',
              tags: [
                  {
                      key: 'Name',
                      value: `ExternalMonitoring/VPC/PublicSubnet${i+1}`,
                  },
              ]
          })
          allocationIds.push(eip.attrAllocationId)

          // Do whatever you need with your EIPs here, ie. store their ref for later use
          eips.push(eip.ref)

          // Add a dependency on the VPC to encure allocation happens before the VPC is created
          this.vpc.node.addDependency(eip)
      }

      this.vpc.publicSubnets.forEach((subnet, index) => {
          // Find the NAT Gateway
          var natGateway = subnet.node.children.find(child => child.node.id == 'NATGateway') as ec2.CfnNatGateway
          // Delete the default EIP created by CDK
          subnet.node.tryRemoveChild('EIP')
          // Override the allocationId on the NATGateway
          natGateway.allocationId = allocationIds[index]
      })
    }
  
    getVpc(): ec2.Vpc {
      return this.vpc;
    }
  }