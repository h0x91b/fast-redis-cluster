var Redis = require('..');
const numCPUs = require('os').cpus().length;
const cluster = require('cluster');
var os = require('os');

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
          console.log(require('../package.json').name+': ' + require('../package.json').version);
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
  var redis = Redis.clusterClient.clusterInstance({ host: '127.0.0.1', port: 7001});
  redis.on('ready', ()=>{
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
      ['PING', 'foo0'],
      ['PING', 'foo1001'],
      ['PING', 'foo4001'],
      ['PING', 'foo6001'],
      ['PING', 'foo4112'],
    ],
    [
      ['SET', 'foo0', 'bar'],
      ['SET', 'foo1001', 'bar'],
      ['SET', 'foo4001', 'bar'],
      ['SET', 'foo6001', 'bar'],
      ['SET', 'foo4112', 'bar']
    ],
    [
      ['GET', 'foo0'],
      ['GET', 'foo1001'],
      ['GET', 'foo4001'],
      ['GET', 'foo6001'],
      ['GET', 'foo4112'],
    ],
    [
      ['INCR', 'incr:foo0'],
      ['INCR', 'incr:foo1001'],
      ['INCR', 'incr:foo4001'],
      ['INCR', 'incr:foo6001'],
      ['INCR', 'incr:foo4112'],
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
      redis.end();
      process.send({
        msg: 'finish'
      });
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
      let p = []
      for(let i=0;i<bulkSize;i++) {
        p.push(redis.rawCallAsync(test[i % test.length]));
        // console.log({a})
        // if(--remain === 0) resolve();
      }
      let r = await Promise.all(p);
      resolve();
    });
  }
}

