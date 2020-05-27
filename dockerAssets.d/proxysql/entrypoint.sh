#!/bin/bash
# dynamically update the proxysql.cnf before spin up the proxysql service
# Refer to the original Dockerfile: https://hub.docker.com/r/proxysql/proxysql/dockerfile

# update the proxysql.cnf
cd /root

./update.sh

proxysql -f -r -D /var/lib/proxysql
