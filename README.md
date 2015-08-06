Origionally forked from https://github.com/joaojeronimo/node_redis_cluster

# fast-redis-cluster2

# Installation

    npm install fast-redis-cluster2 --save

# Usage

This module exports two objects. `clusterClient` is to be used with a regular Redis Cluster, you just need to supply a link (like `127.0.0.1:6379`) and the other members of the cluster will be found, after that you can use it pretty much like the original `node_redis` module:

```javascript
var RedisCluster = require('redis-cluster').clusterClient;
var redis = RedisCluster;
var redisPubSub = RedisCluster;
var assert = require('assert');

var firstLink = '127.0.0.1:6379'; // Used to discover the rest of the cluster
new redis.clusterInstance(firstLink, function (err, r) {
  if (err) throw err;
  r.set('foo', 'bar', function (err, reply) {
    if (err) throw err;
    assert.equal(reply,'OK');

    r.get('foo', function (err, reply) {
      if (err) throw err;
      assert.equal(reply, 'bar');
    });
  });
});

new redisPubSub.clusterInstance(firstLink, function (err, r) {
  r.subscribe('channel');

  for( var link in redisPubSub.redisLinks )
  {
    redisPubSub.redisLinks[link].link.on('message', function (channel, message) {
        // New message in a channel, necessarily 'channel' here because it's the only one we're subscribed to.
    });
  }
});
```

Don't forget that despite being a thin wrapper above `node_redis`, you still can't use all the commands you would use against a normal Redis server. For instance, don't expect the `KEYS` command to work (in fact, in the [Redis Cluster spec](http://redis.io/topics/cluster-spec) it says that "all the operations where in theory keys are not available in the same node are not implemented").
