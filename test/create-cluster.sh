#!/bin/bash

echo "Start 6 redises"
HOSTS=""
for port in {9000..9005}; do
    redis-cli -p $port shutdown
    rm -rf /tmp/redis-cluster/$port

    echo "Start redis on port $port"
    mkdir -p /tmp/redis-cluster/$port
    
    redis-server --cluster-enabled yes --save "" --dir /tmp/redis-cluster/$port/ --port $port --daemonize yes
    HOSTS="$HOSTS 127.0.0.1:$port"
done

echo "./redis-trib.rb create --replicas 1 $HOSTS"

expect -c "
    spawn ./redis-trib.rb create --replicas 1 $HOSTS
    expect \"Can I set the above configuration? (type 'yes' to accept): \"
    send \"yes\r\"
    interact
"


node test-redis-failover.js &

echo "Sleep 3s and kill redis 9001"
sleep 3s
echo "Kill now 9001"
kill -9 $(ps aux | grep redis-server | grep 9001 | awk '{print $2}')
