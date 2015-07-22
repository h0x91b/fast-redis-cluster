#!/bin/bash
echo "Shutdown redis"

redis-cli -p 7001 shutdown
redis-cli -p 7002 shutdown
redis-cli -p 7003 shutdown
redis-cli -p 7011 shutdown
redis-cli -p 7012 shutdown
redis-cli -p 7013 shutdown

rm -rf /tmp/redis-cluster/7001
rm -rf /tmp/redis-cluster/7002
rm -rf /tmp/redis-cluster/7003
rm -rf /tmp/redis-cluster/7011
rm -rf /tmp/redis-cluster/7012
rm -rf /tmp/redis-cluster/7013

echo "Run redis"
mkdir -p /tmp/redis-cluster/7001
mkdir -p /tmp/redis-cluster/7002
mkdir -p /tmp/redis-cluster/7003
mkdir -p /tmp/redis-cluster/7011
mkdir -p /tmp/redis-cluster/7012
mkdir -p /tmp/redis-cluster/7013

redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7001/ --port 7001 --daemonize yes --save ""
redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7002/ --port 7002 --daemonize yes --save ""
redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7003/ --port 7003 --daemonize yes --save ""
redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7011/ --port 7011 --daemonize yes --save ""
redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7012/ --port 7012 --daemonize yes --save ""
redis-server --cluster-enabled yes --appendonly yes --dir /tmp/redis-cluster/7013/ --port 7013 --daemonize yes --save ""


echo "wait for redis starts"
function waitforredis {
    redis-cli -p 7001 ping || waitforredis
    redis-cli -p 7002 ping || waitforredis
    redis-cli -p 7003 ping || waitforredis
    redis-cli -p 7011 ping || waitforredis
    redis-cli -p 7012 ping || waitforredis
    redis-cli -p 7013 ping || waitforredis
}

waitforredis

redis-cli -p 7001 cluster meet 127.0.0.1 7002
redis-cli -p 7001 cluster meet 127.0.0.1 7003
redis-cli -p 7001 cluster meet 127.0.0.1 7011
redis-cli -p 7001 cluster meet 127.0.0.1 7012
redis-cli -p 7001 cluster meet 127.0.0.1 7013

SLOTS=()
for s in {0..8191}; do 
    SLOTS+=($s)
done
echo "adding slots to redis 7001"
IFS=" "
redis-cli -p 7001 cluster addslots ${SLOTS[*]}

SLOTS=()
for s in {8192..16382}; do 
    SLOTS+=($s)
done
echo "adding slots to redis 7002"
redis-cli -p 7002 cluster addslots ${SLOTS[*]}

echo "adding 1 slot to redis 7003"
redis-cli -p 7003 cluster addslots 16383

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

echo "Attach slaves"
PORT=7011
function waitforslave {
    if [[ $(redis-cli -p $PORT cluster nodes | grep myself | grep slave | wc -l) -ne "1" ]]; then
        sleep 1
        waitforslave
    fi
}
redis-cli -p 7011 cluster replicate $(redis-cli -p 7001 cluster nodes | grep myself | cut -d' ' -f1)
PORT=7011
waitforslave
redis-cli -p 7012 cluster replicate $(redis-cli -p 7002 cluster nodes | grep myself | cut -d' ' -f1)
PORT=7012
waitforslave
redis-cli -p 7013 cluster replicate $(redis-cli -p 7003 cluster nodes | grep myself | cut -d' ' -f1)
PORT=7013
waitforslave

echo "Importing basic data"
redis-cli -p 7001 -c set foo bar
redis-cli -p 7001 -c set foo2 bar2 #slot 1044

sleep 5
echo "Done"
redis-cli -p 7001 cluster nodes