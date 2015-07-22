var rcluster = require(__dirname+'/../index.js').clusterClient;
var FastRedis = require(__dirname+'/../node_modules/redis-fast-driver');
var cp = require('child_process');
var util = require('util');

jasmine.getEnv().defaultTimeoutInterval = 60000;

describe('Advanced checks', function() {
	var cluster, t;
	var redis7001, redis7002, redis7003, redis7011, redis7012, redis7013;
	it('Run cluster', function(done){
		var spawn = cp.spawn('/bin/bash', [__dirname+'/../run-redis-cluster.sh']);
		spawn.on('error', function(e){
			console.log('error', e);
		});
		spawn.stdout.on('data', function(out){
			util.print(out.toString('utf-8'));
		});
		spawn.on('close', function(e){
			console.log('on close', e);
			done();
		});
	});
	
	it('Check connection', function(done) {
		cluster = new rcluster.clusterInstance('127.0.0.1:7001', function (err, r) {
			expect(err).toBeNull();
			expect(r).not.toBeNull();
			expect(typeof r.rawCall).toBe('function');
			
			done();
		});
	});
	
	it('Connect to 7001', function(done){
		redis7001 = new FastRedis({
			host: '127.0.0.1',
			port: '7001',
			auth: null
		});
		redis7001.on('ready', function(e){
			expect(e).toBeUndefined();
			
			redis7001.rawCall(['CLUSTER', 'NODES'], function(e, nodes){
				expect(e).toBeNull();
				
				nodes.split('\n').forEach(function(node){
					if(node.indexOf('myself') === -1) return;
					redis7001.id = node.split(' ')[0];
					done();
				});
			});
		});
	});
	
	it('Connect to 7002', function(done){
		redis7002 = new FastRedis({
			host: '127.0.0.1',
			port: '7002',
			auth: null
		});
		redis7002.on('ready', function(e){
			expect(e).toBeUndefined();
			
			redis7002.rawCall(['CLUSTER', 'NODES'], function(e, nodes){
				expect(e).toBeNull();
				
				nodes.split('\n').forEach(function(node){
					if(node.indexOf('myself') === -1) return;
					redis7002.id = node.split(' ')[0];
					done();
				});
			});
		});
	});
	
	it('Connect to 7003', function(done){
		redis7003 = new FastRedis({
			host: '127.0.0.1',
			port: '7003',
			auth: null
		});
		redis7003.on('ready', function(e){
			expect(e).toBeUndefined();
			
			redis7003.rawCall(['CLUSTER', 'NODES'], function(e, nodes){
				expect(e).toBeNull();
				
				nodes.split('\n').forEach(function(node){
					if(node.indexOf('myself') === -1) return;
					redis7003.id = node.split(' ')[0];
					done();
				});
			});
		});
	});
	
	it('Connect to 7011', function(done){
		redis7011 = new FastRedis({
			host: '127.0.0.1',
			port: '7011',
			auth: null
		});
		redis7011.on('ready', function(e){
			expect(e).toBeUndefined();
			
			redis7011.rawCall(['CLUSTER', 'NODES'], function(e, nodes){
				expect(e).toBeNull();
				
				nodes.split('\n').forEach(function(node){
					if(node.indexOf('myself') === -1) return;
					redis7011.id = node.split(' ')[0];
					done();
				});
			});
		});
	});
	
	it('Connect to 7012', function(done){
		redis7012 = new FastRedis({
			host: '127.0.0.1',
			port: '7012',
			auth: null
		});
		redis7012.on('ready', function(e){
			expect(e).toBeUndefined();
			
			redis7012.rawCall(['CLUSTER', 'NODES'], function(e, nodes){
				expect(e).toBeNull();
				
				nodes.split('\n').forEach(function(node){
					if(node.indexOf('myself') === -1) return;
					redis7012.id = node.split(' ')[0];
					done();
				});
			});
		});
	});
	
	it('Connect to 7013', function(done){
		redis7013 = new FastRedis({
			host: '127.0.0.1',
			port: '7013',
			auth: null
		});
		redis7013.on('ready', function(e){
			expect(e).toBeUndefined();
			
			redis7013.rawCall(['CLUSTER', 'NODES'], function(e, nodes){
				expect(e).toBeNull();
				
				nodes.split('\n').forEach(function(node){
					if(node.indexOf('myself') === -1) return;
					redis7013.id = node.split(' ')[0];
					done();
				});
			});
		});
	});
	
	// it('Attach slave 7011 to redis 7001', function(done){
	// 	redis7011.rawCall(['CLUSTER', 'REPLICATE', redis7001.id], function(e){
	// 		expect(e).toBeNull();
	// 		done();
	// 	});
	// });
	//
	// it('Attach slave 7012 to redis 7002', function(done){
	// 	redis7012.rawCall(['CLUSTER', 'REPLICATE', redis7002.id], function(e){
	// 		expect(e).toBeNull();
	// 		done();
	// 	});
	// });
	//
	// it('Attach slave 7013 to redis 7003', function(done){
	// 	redis7013.rawCall(['CLUSTER', 'REPLICATE', redis7003.id], function(e){
	// 		expect(e).toBeNull();
	// 		done();
	// 	});
	// });
	
	var slot;
	
	it('Place something in slot 7365', function(done){
		var key = 'привет';
		slot = cluster.calcSlot(key);
		expect(slot).toBe(7365);
		redis7001.rawCall(['INCR', key], function(e){
			expect(e).toBeNull();
			done();
		});
	});
	
	it('Set slot 7365 on 7002 in IMPORTING from A', function(done){
		redis7002.rawCall(['CLUSTER', 'SETSLOT', slot, 'IMPORTING', redis7001.id], function(e){
			expect(e).toBeNull();
			done();
		});
	});
	
	it('Set slot 7365 on 7001 in MIGRATING to B', function(done){
		redis7001.rawCall(['CLUSTER', 'SETSLOT', slot, 'MIGRATING', redis7002.id], function(e){
			expect(e).toBeNull();
			done();
		});
	});
	
	it('Check is driver can parse', function(done){
		expect(function(){
			var r = new rcluster.clusterInstance('127.0.0.1:7001', function (err, r) {
				expect(err).toBeNull();
				expect(r).not.toBeNull();
				expect(typeof r.rawCall).toBe('function');
				
				r.end();
				done();
			});
		}).not.toThrow();
	});
	
	it('Migrate key', function(done){
		redis7001.rawCall(['migrate', '127.0.0.1', '7002', 'привет', '0', '5000', 'REPLACE'],function(err){
			expect(err).toBeNull();
			done();
		});
	});
	
	it('Handling of -ASK', function(done){
		cluster.rawCall(['INCR', 'привет'],function(err, resp){
			expect(err).toBeNull();
			expect(resp).toBe(2);
			done();
		});
	});

	it('Set slot complete on 7001', function(done){
		redis7001.rawCall(['CLUSTER', 'SETSLOT', slot, 'NODE', redis7002.id],function(err, resp){
			expect(err).toBeNull();
			expect(resp).toBe('OK');
			done();
		});
	});

	it('Set slot complete on 7002', function(done){
		redis7002.rawCall(['CLUSTER', 'SETSLOT', slot, 'NODE', redis7002.id],function(err, resp){
			expect(err).toBeNull();
			expect(resp).toBe('OK');
			done();
		});
	});
	
	it('Handling of topology change `MOVED`', function(done){
		cluster.rawCall(['INCR', 'привет'],function(err, resp){
			expect(err).toBeNull();
			expect(resp).toBe(3);
			done();
		});
	});
	
	it('Test manual failover', function(done){
		redis7012.rawCall(['CLUSTER', 'FAILOVER'], function(e, data){
			expect(e).toBeNull();
			
			cluster.rawCall(['INCR', 'привет'],function(err, resp){
				expect(err).toBeNull();
				expect(resp).toBe(4);
				done();
			});
		});
	});
	
	it('Test crash of master 7012', function(done){
		redis7012.on('error', function(){
			cluster.rawCall(['INCR', 'привет'],function(err, resp){
				expect(err).toBeNull();
				expect(resp).toBe(5);
				done();
			});
		});
		redis7012.rawCall(['DEBUG', 'SEGFAULT']);
	});
	
	it('Run again redis 7012', function(done){
		var spawn = cp.spawn('/usr/local/bin/redis-server', [
			'--cluster-enabled', 'yes',
			'--appendonly', 'yes',
			'--dir', '/tmp/redis-cluster/7012/',
			'--port', '7012',
			'--daemonize', 'yes',
			'--save', '""'
		]);
		spawn.stdout.on('data', function(out){
			util.print(out.toString('utf-8'));
		});
		
		spawn.on('close', function(){
			done();
		});
	});
	
	it('Test crash of master 7001', function(done){
		redis7001.on('error', function(){
			cluster.rawCall(['SET', 'foo2', 'bar'],function(err, resp){
				expect(err).toBeNull();
				expect(resp).toBe('OK');
				done();
			});
		});
		redis7001.rawCall(['DEBUG', 'SEGFAULT']);
	});
	
	it('End', function(done) {
		cluster.end();
		//redis7001.end();
		redis7002.end();
		redis7003.end();
		redis7011.end();
		redis7012.end();
		redis7013.end();
		done();
	});
});