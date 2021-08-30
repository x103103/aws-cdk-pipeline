import * as cdk from '@aws-cdk/core'
import * as codecommit from '@aws-cdk/aws-codecommit'
import * as codebuild from '@aws-cdk/aws-codebuild'
import * as ecr from '@aws-cdk/aws-ecr'

export class CdkRails1Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const repository = new codecommit.Repository(this, 'Repository', {
      repositoryName: 'cdk-rails-1',
      description: 'The same rails-1 app but managed by cdk',
    })
    const ecrRepository = new ecr.Repository(this, 'EcrRepository', {
      repositoryName: 'cdk-rails-1',
    })

    new codebuild.Project(this, 'CodeBuildProject', {
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
        }
      },
    })
  }
}
