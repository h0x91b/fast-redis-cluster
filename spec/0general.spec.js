var rcluster = require(__dirname+'/../index.js').clusterClient;
var cp = require('child_process');
var util = require('util');


describe('General checks', function(){
	var client, t;
	
	it('Run cluster', function(done){
		console.log('run cluster');
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
	
	it('Check connection', function(done){
		console.log('Check connection');
		client = new rcluster.clusterInstance('127.0.0.1:7001', function (err, r) {
			expect(err).toBeNull();
			expect(r).not.toBeNull();
			expect(typeof r.rawCall).toBe('function');
			
			done();
		});
	});
	
	it('Basic incr function', function(done){
		client.rawCall(['INCR', 'INCR:A'], function(err, incr){
			expect(err).toBe(null);
			expect(typeof incr).toBe('number');
			
			t = incr;
			done();
		});
	});
	
	it('Increment', function(done){
		client.rawCall(['INCR', 'INCR:A'], function(err, incr){
			expect(err).toBe(null);
			expect(typeof incr).toBe('number');
			expect(incr).toBe(t+1);
			done();
		});
	});
	
	it('HMGET should return object', function(done){
		client.rawCall(['DEL', 'HSET:A']);
		client.rawCall(['HMGET', 'HSET:A', 'A', 'B', 'C'], function(err, obj){
			
			expect(err).toBe(null);
			expect(obj).not.toBe(null);
			expect(typeof obj).toBe('object');
			expect(function(){
				expect(Array.isArray(obj)).toBe(false);
				expect(obj.A).toBe(null);
				expect(obj.B).toBe(null);
				expect(obj.C).toBe(null);
			}).not.toThrow();
			done();
		});
	});
	
	it('HMSET and HGETALL should work with object', function(done){
		client.rawCall(['DEL', 'HSET:A']);
		
		client.rawCall(['HMSET', 'HSET:A', {
			A: 123,
			B: 124,
			C: 125
		}]);
		
		client.rawCall(['HGETALL', 'HSET:A'], function(err, obj){
			console.log('HGETALL', err, obj);
			
			expect(err).toBe(null);
			expect(obj).not.toBe(null);
			expect(typeof obj).toBe('object');
			expect(function(){
				expect(Array.isArray(obj)).toBe(false);
				expect(obj.A).toBe('123');
				expect(obj.B).toBe('124');
				expect(obj.C).toBe('125');
			}).not.toThrow();
			done();
		});
	});
	
	it('HMSET and HGETALL should work with array too', function(done){
		client.rawCall(['DEL', 'HSET:A']);
		client.rawCall(['HMSET', 'HSET:A', 'A', 123, 'B', 124, 'C', 125]);
		
		client.rawCall(['HGETALL', 'HSET:A'], function(err, obj){
			console.log('HGETALL', err, obj);
			
			expect(err).toBe(null);
			expect(obj).not.toBe(null);
			expect(typeof obj).toBe('object');
			expect(function(){
				expect(Array.isArray(obj)).toBe(false);
				expect(obj.A).toBe('123');
				expect(obj.B).toBe('124');
				expect(obj.C).toBe('125');
			}).not.toThrow();
			done();
		});
	});
	
	it('End', function(done){
		client.end();
		done();
	});
});