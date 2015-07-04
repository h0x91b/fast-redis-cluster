#!/bin/bash
echo "Shutdown redis"

redis-cli -p 7001 shutdown
redis-cli -p 7002 shutdown

rm -rf /tmp/redis-cluster/7001
rm -rf /tmp/redis-cluster/7002

echo "Run redis"
mkdir -p /tmp/redis-cluster/7001
mkdir -p /tmp/redis-cluster/7002

redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7001/ --port 7001 --daemonize yes --save ""
redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7002/ --port 7002 --daemonize yes --save ""

echo "wait for redis starts"
function waitforredis {
    redis-cli -p 7001 ping || waitforredis
    redis-cli -p 7002 ping || waitforredis
}

waitforredis

redis-cli -p 7001 cluster meet 127.0.0.1 7002

SLOTS=()
for s in {0..8191}; do 
    SLOTS+=($s)
done
echo "adding slots to redis 7001"
IFS=" "
redis-cli -p 7001 cluster addslots ${SLOTS[*]}

SLOTS=()
for s in {8192..16383}; do 
    SLOTS+=($s)
done
echo "adding slots to redis 7002"
redis-cli -p 7002 cluster addslots ${SLOTS[*]}

function waitforrediscluster {
    echo "wait for redis cluster starts"
    if [[ $(redis-cli -p 7001 cluster info | grep "cluster_state:ok" | wc -l) -ne "1" ]]; then
        sleep 1
        waitforrediscluster
    fi
    # if [[ $(redis-cli -p 7011 cluster info | grep "cluster_state:ok" | wc -l) -ne "1" ]]; then
    #     sleep 1
    #     waitforredis2
    # fi
}

waitforrediscluster

echo "Importing basic data"
redis-cli -p 7001 -c set foo bar
redis-cli -p 7001 -c set foo2 bar2 #slot 1044

echo "Done"
redis-cli -p 7001 cluster nodes