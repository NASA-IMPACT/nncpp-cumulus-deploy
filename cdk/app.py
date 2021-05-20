#!/usr/bin/env python3
import os

from aws_cdk import core
from data_persistence_prerequisites_stack import DataPersistencePrerequisitesStack
from cumulus_prerequisites_stack import CumulusPrerequisitesStack

app = core.App()

identifier = os.environ["IDENTIFIER"]
stage = os.environ["STAGE"]

DataPersistencePrerequisitesStack(
    app,
    construct_id="nncpp-cumulus-deploy-data-persistence-stack",
    identifier=identifier,
    stage=stage
)

CumulusPrerequisitesStack(
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
