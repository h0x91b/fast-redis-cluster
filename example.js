var rcluster = require('./index.js').clusterClient;

var t = new rcluster.clusterInstance('127.0.0.1:7001', function (err, r) {
	if (err) throw err;
	
	r.rawCall(['SET', 'привет', 'мир'], function(e, data){
		console.log('unicode save', e, data);
		
		r.rawCall(['SET', 'привет2', 'мир2'], function(e, data){
			console.log('unicode save2', e, data);
			
			r.rawCall(['SET', 'привет3', 'мир3'], function(e, data){
				console.log('unicode save3', e, data);
			}, {targetSlot: 10000});
		}, {targetSlot: 10000});
	
	}, {targetSlot: 10000});
	
	r.hmset('hset:1', {a:1,b:2,c:'hello'}, function(e,d){
		console.log(e,d);
	});
	
	r.ping(function(e, resp){
		console.log('ping', e, resp);
	});

	function doIt() {
		r.set('foo', 'bar', function (err, reply) {
			if (err) throw err;
			
			r.get('foo', function (err, reply) {
				if (err) throw err;
				console.log(err, reply);
			});
		});

		r.hgetall('hset:1', function(e, d){
			console.log(e,d);
		});

		try {
			console.log('hmget');
			r.hmget('hset:1', 'a', 'b', 'f', function(e, d){
				console.log('hmget',e,d);
			});
		} catch(e) {
			console.log('exception', e, e.stack)
		}

	}
	doIt();
});

//queue
t.ping(function(e, data){
	console.log('PONG', e, data);
});

setInterval(function(){
	t.incr('key', function(e, incr){
		console.log('INCR', e, incr);
	});
}, 1000);