#!/usr/bin/env python3

from aws_cdk import (
    core,
    aws_s3,
    aws_dynamodb
)


class DataPersistencePrerequisitesStack(core.Stack):
    def __init__(
        self,
        scope: core.Construct,
        construct_id: str,
        identifier: str,
        stage: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        internal_bucket = aws_s3.Bucket(
            self,
            id=f"{identifier}-{stage}-internal",
            auto_delete_objects=True,
            removal_policy=core.RemovalPolicy.DESTROY,
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL
        )

        state_bucket = aws_s3.Bucket(
            self,
            id=f"{identifier}-{stage}-tf-state",
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL,
            versioned=True
        )

        locks_table = aws_dynamodb.Table(
            self,
            id=f"{identifier}-{stage}-tf-locks",
            table_name=f"{identifier}-{stage}-tf-locks",
            partition_key=aws_dynamodb.Attribute(
                name="LockId",
                type=aws_dynamodb.AttributeType.STRING
            ),
            billing_mode=aws_dynamodb.BillingMode.PAY_PER_REQUEST
        )
