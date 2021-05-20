#!/usr/bin/env python3
import os

from aws_cdk import core
from data_persistence_stack import DataPersistenceStack
from cumulus_stack import CumulusStack

app = core.App()

identifier = os.environ["IDENTIFIER"]
stage = os.environ["STAGE"]

DataPersistenceStack(
    app,
    construct_id="nncpp-cumulus-deploy-data-persistence-stack",
    identifier=identifier,
    stage=stage
)

CumulusStack(
    app,
    construct_id="nncpp-cumulus-deploy-cumulus-stack",
    identifier=identifier,
    stage=stage
)

for k, v in {
    "Project": identifier,
    "CDK": "true"
}.items():
    core.Tags.of(app).add(k, v, apply_to_launched_instances=True)

app.synth()
