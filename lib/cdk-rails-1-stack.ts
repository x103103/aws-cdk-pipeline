import * as cdk from '@aws-cdk/core'
import * as codecommit from '@aws-cdk/aws-codecommit'
import * as codebuild from '@aws-cdk/aws-codebuild'
import * as codepipeline from '@aws-cdk/aws-codepipeline'
import * as codepipelineActions from '@aws-cdk/aws-codepipeline-actions'
import * as ecr from '@aws-cdk/aws-ecr'
import * as ecs from '@aws-cdk/aws-ecs'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2'
import * as s3 from '@aws-cdk/aws-s3'

export class CdkRails1Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // *************************************************************************
    // Repositories
    const repository = new codecommit.Repository(this, 'Repository', {
      repositoryName: 'cdk-rails-1',
      description: 'The same rails-1 app but managed by cdk',
    })
    const ecrRepository = new ecr.Repository(this, 'EcrRepository', {
      repositoryName: 'cdk-rails-1',
    })

    // *************************************************************************
    // Fargate
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 })
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'cdk-rails-1',
    })
    const webTaskDefinition = new ecs.FargateTaskDefinition(this, 'WebTaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256,
      family: 'cdk-rails-1-web',
    })
    const stagingEnvBucket = new s3.Bucket(this, 'StagingEnvBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      bucketName: 'rails-1-staging',
      versioned: true,
    })
    const webContainer = webTaskDefinition.addContainer('WebContainer', {
      containerName: 'cdk-rails-1-web',
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
      portMappings: [{ hostPort: 3000, containerPort: 3000 }],
      // environment: {
      //   DATABASE_URL: '',
      //   RAILS_ENV: 'production',
      //   SECRET_KEY_BASE: 'rvrevre34343242fvfeverve344',
      // },
      environmentFiles: [
        ecs.EnvironmentFile.fromBucket(stagingEnvBucket, '/rails-1.env')
      ],
    })
    const webService = new ecs.FargateService(this, 'WebService', {
      cluster,
      serviceName: 'cdk-rails-1-web',
      taskDefinition: webTaskDefinition,
      assignPublicIp: true,
      desiredCount: 1,
    })
    const scaling = webService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 1,
    })
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    })

    // *************************************************************************
    // Pipeline
    const sourceOutput = new codepipeline.Artifact('SourceArtifact')
    const sourceAction = new codepipelineActions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      branch: 'cdk',
      repository,
      output: sourceOutput,
    })

    const codebuildProject = new codebuild.Project(this, 'CodeBuildProject', {
      projectName: 'cdk-rails-1',
      source: codebuild.Source.codeCommit({ repository }),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER, codebuild.LocalCacheMode.CUSTOM),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
        environmentVariables: {
          SECRET_KEY_BASE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'cerref234rrjnjnj3n4jn43njk3n4j3',
          },
          REPOSITORY_URL: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: ecrRepository.repositoryUri,
          },
          REPOSITORY_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: ecrRepository.repositoryName,
          },
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '412346317774',
          },
        },
      },
    })
    codebuildProject.enableBatchBuilds()
    ecrRepository.grantPullPush(codebuildProject.grantPrincipal)

    const buildOutput = new codepipeline.Artifact('BuildArtifacts')
    const buildAction = new codepipelineActions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: codebuildProject,
      executeBatchBuild: true,
      combineBatchBuildArtifacts: true,
      input: sourceOutput,
      outputs: [buildOutput],
    })
    const deployAction = new codepipelineActions.EcsDeployAction({
      actionName: 'Deploy',
      service: webService,
      imageFile: new codepipeline.ArtifactPath(
        buildOutput,
        'production_image/BuildArtifacts/imagedefinitions.json',
      ),
    })
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'cdk-rails-1',
    })
    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    })
    pipeline.addStage({
      stageName: 'Build',
      actions: [buildAction],
    })
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    })

    // *************************************************************************
    // Application Load Balancer
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true,
    })
    const listener = lb.addListener('Listener', {
      port: 80,
    })
    listener.addTargets('ECS', {
      port: 80,
      targets: [webService.loadBalancerTarget({
        containerName: webContainer.containerName,
        containerPort: 3000,
      })],
    })
    listener.connections.allowDefaultPortFromAnyIpv4('Open to the world')

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: lb.loadBalancerDnsName })
  }
}
