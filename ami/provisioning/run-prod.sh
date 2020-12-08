#!/bin/bash

ansible-playbook -i inventory-prod playbook-prod.yml --extra-vars "@vars/prod-secrets.json"

## You can get the `prod-secrets.json` from vault.