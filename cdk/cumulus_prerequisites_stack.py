#!/usr/bin/env python3

from aws_cdk import (
    core,
    aws_s3
)


class CumulusPrerequisitesStack(core.Stack):
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

        private_bucket = aws_s3.Bucket(
            self,
            id=f"{identifier}-{stage}-private",
            auto_delete_objects=True,
            removal_policy=core.RemovalPolicy.DESTROY,
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL
        )

        protected_bucket = aws_s3.Bucket(
            self,
            id=f"{identifier}-{stage}-protected",
            auto_delete_objects=True,
            removal_policy=core.RemovalPolicy.DESTROY,
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL
        )

        public_bucket = aws_s3.Bucket(
            self,
            id=f"{identifier}-{stage}-public",
            auto_delete_objects=True,
            removal_policy=core.RemovalPolicy.DESTROY,
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL
        )
