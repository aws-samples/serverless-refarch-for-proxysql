#!/bin/bash


INFILE=${INFILE-proxysql.cnf.template}
OUTFILE=${OUTFILE-/etc/proxysql.cnf}

WRITER=${DB_WRITER_HOSTNAME-writer.db.local}
READER=${DB_READER_HOSTNAME-reader.db.local}

echo "[update.sh]=> updating proxysql.cnf"

sed \
-e "s/##{DB_WRITER_HOST}##/${WRITER}/g" \
-e "s/##{DB_READER_HOST}##/${READER}/g" \
-e "s/##{DB_MASTER_USERNAME}##/${DB_MASTER_USERNAME}/g" \
-e "s/##{DB_MASTER_PASSWORD}##/${DB_MASTER_PASSWORD}/g" \
-e "s/##{RADMIN_PASSWORD}##/${RADMIN_PASSWORD}/g" \
$INFILE > $OUTFILE
