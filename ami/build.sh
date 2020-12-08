#!/bin/bash

aws ec2 describe-images \
  --owners $(aws sts get-caller-identity | jq .Account | sed -e 's/\"//g') | jq .Images | grep 'amzn-linux-2-with-docker-'

if [ $? != 0 ]; then
    packer build build-amzn2.json
fi