FROM alpine:latest

RUN apk add --no-cache bash mysql-client

COPY bootstrap.sh /root/

CMD ["bash", "-c", "/root/bootstrap.sh" ]