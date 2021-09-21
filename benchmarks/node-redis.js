
const numCPUs = require('os').cpus().length;
const cluster = require('cluster');
var os = require('os');
var {createCluster} = require('redis');
if (cluster.isMaster) {
  let waitFor = numCPUs;
  let workers = [];
  let stats = [];
  let finished = 0;
  for(let i=0;i<numCPUs;i++) {
    let worker = cluster.fork();
    workers.push(worker);
    worker.on('message', (event)=>{
      if(event.msg === 'connected') {
        if(--waitFor === 0) {
          console.log('begin the show');
          workers.forEach(w => w.send({msg: 'beginTest'}))
        }
        return
      }
      if(event.msg === 'stats') {
        stats.push(event.stats);
        return;
      }
      if(event.msg === 'finish') {
        if(++finished === numCPUs) {
          // calc stats
          console.log('==========================');
          console.log(require('../node_modules/redis/package.json').name+': ' + require('../node_modules/redis/package.json').version);
          console.log('Date: ' + (new Date).toISOString());
          console.log('CPU: ' + numCPUs);
          console.log('OS: ' + os.platform() + ' ' + os.arch());
          console.log('node version: ' + process.version);
          console.log('==========================');
          console.log('results', stats.reduce((acc, cur) => {
            let key = cur.test.join(' ') + ' Bulk size '+cur.bulkSize;
            acc[key] = acc[key] || {key, speed: 0, ops: 0}
            acc[key].speed += cur.speed
            acc[key].ops += cur.ops
            return acc
          }, {}))
          process.exit(0);
        }
        return;
      }
      console.log('message from child', event);
    })
  }
} else {
  const redis = createCluster({
    rootNodes: [
      {
        host: "127.0.0.1",
        port: 7001,
      },
    ],
  });
  redis.connect().then(()=>{
    // console.log('connected');
    process.send({
      msg: 'connected',
    })
    // console.log('foo0', redis.calcSlot('foo0'));
    // console.log('foo1001', redis.calcSlot('foo1001'));
    // console.log('foo4001', redis.calcSlot('foo4001'));
    // console.log('foo6001', redis.calcSlot('foo6001'));
    // console.log('foo4112', redis.calcSlot('foo4112'));
  });

  process.on('message', (evt)=>{
    if(evt.msg === 'beginTest') return beginTest();
    console.log('worker on message', evt);
  });

  var tests = [
    [
      ['ping', ['foo0']],
      ['ping', ['foo1001']],
      ['ping', ['foo4001']],
      ['ping', ['foo6001']],
      ['ping', ['foo4112']],
    ],
    [
      ['set', ['foo0', 'bar']],
      ['set', ['foo1001', 'bar']],
      ['set', ['foo4001', 'bar']],
      ['set', ['foo6001', 'bar']],
      ['set', ['foo4112', 'bar']],
    ],
    [
      ['get', ['foo0']],
      ['get', ['foo1001']],
      ['get', ['foo4001']],
      ['get', ['foo6001']],
      ['get', ['foo4112']],
    ],
    [
      ['incr', ['incr:foo0']],
      ['incr', ['incr:foo1001']],
      ['incr', ['incr:foo4001']],
      ['incr', ['incr:foo6001']],
      ['incr', ['incr:foo4112']],
    ],
    // ['INCR', 'number'],
    // ['HGETALL', 'hset:1'],
    // ['ZRANGE', 'zset:1', 0, 5],
    // ['LRANGE', 'list', 0, 99]
  ];

  var bulkSize = [
    5,
    10,
    100,
    1000,
    5000,
    10000,
  ];

  var minIterations = 100000;

  let testIndex = 0;

  async function beginTest() {
    let test = tests[testIndex++];
    if(!test) {
      // console.log('the end');
      // redis.quit();
      process.send({
        msg: 'finish'
      });
      setTimeout(()=>{
        process.exit(0);
      }, 1000)
      return;
    }

    console.log('beginTest', test[0]);
    for(let i=0;i<bulkSize.length;i++) {
      // console.time(test[0]);
      const start = Date.now();
      let ops = 0;
      for(;ops<minIterations;) {
        await testBulk(test, bulkSize[i]);
        ops += bulkSize[i];
      }
      // console.timeEnd(test[0]);
      const stats = {
        pid: process.pid,
        test: test[0],
        ops,
        bulkSize: bulkSize[i],
        time: Date.now() - start,
      };
      stats.speed = Math.round(ops / (stats.time / 1000));
      console.log(stats)
      process.send({
        msg: 'stats',
        stats
      })
    }
    setTimeout(beginTest, 3000);
  }

  async function testBulk(test, bulkSize) {
    // console.log('testBulk', {
    //   test, 
    //   bulkSize
    // });
    return new Promise(async (resolve) => {
      let remain = bulkSize;
      for(let i=0;i<bulkSize;i++) {
        const t = test[i % test.length];
        await redis[t[0]](...t[1]);
        if(--remain === 0) resolve();
      }
    });
  }
}

