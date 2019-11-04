#!/bin/bash

cat << EOF | mysql -uadmin -padmin -h127.0.0.1 -P6032
insert into mysql_servers(hostgroup_id,hostname,port,weight,comment) values(1,'${DB_WRITER_HOSTNAME}','${DB_WRITER_PORT}',1,'Write Group');
insert into mysql_servers(hostgroup_id,hostname,port,weight,comment) values(2,'${DB_READER_HOSTNAME}','${DB_READER_PORT}',1,'Read Group');
insert into mysql_users(username,password,default_hostgroup) VALUES ('admin','${DB_PASSWORD}',1);
insert into mysql_query_rules(rule_id,active,match_digest,destination_hostgroup,apply)values(1,1,'^SELECT.*FOR UPDATE$',1,1);
insert into mysql_query_rules(rule_id,active,match_digest,destination_hostgroup,apply)values(2,1,'^SELECT',2,1);
select rule_id,active,match_digest,destination_hostgroup,apply from mysql_query_rules;
load mysql users to runtime;
load mysql servers to runtime;
load mysql query rules to runtime;
load mysql variables to runtime;
load admin variables to runtime;
save mysql users to disk;
save mysql servers to disk;
save mysql query rules to disk;
save mysql variables to disk;
save admin variables to disk;
load mysql users to runtime;
EOF
