import json
import pymysql.cursors
import os

existing_connection = None


def build_conn():
    proxy_host = os.environ['PROXY_HOST']
    proxy_port = os.environ['PROXY_PORT']
    db_user = os.environ['PROXY_DB_USER']
    db_password = os.environ['PROXY_DB_PASSWORD']
    print('[INFO] buiding new db connection')
    connection = pymysql.connect(host=proxy_host,
                                 port=int(proxy_port),
                                 user=db_user,
                                 password=db_password,
                                 db='test_proxysql',
                                 charset='utf8mb4',
                                 cursorclass=pymysql.cursors.DictCursor)
    return connection


def respond(err, res=None):
    return {
        'statusCode': '400' if err else '200',
        'body': err.message if err else json.dumps(res),
        'headers': {
            'Content-Type': 'application/json',
        },
    }


def lambda_handler(event, context):
    global existing_connection
    if not existing_connection:
        existing_connection = build_conn()
    else:
        print('[INFO] reusing the existing connection')

    try:
        with existing_connection.cursor() as cursor:
            # Create a new record
            sql = "INSERT INTO `test_tables` (`name`, `age`) VALUES (%s, %s)"
            cursor.execute(sql, ('pahud', '20'))

        # connection is not autocommit by default. So you must commit to save
        # your changes.
        existing_connection.commit()

        with existing_connection.cursor() as cursor:
            # Read a single record
            sql = "SELECT count(*) as cnt FROM `test_tables`"
            cursor.execute(sql)
            result = cursor.fetchone()
            print(result)
    finally:
        print('[INFO] leave the connection open')
        # existing_connection.close()

    return respond(None, result)
