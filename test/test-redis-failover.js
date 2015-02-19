var rcluster = require(__dirname+'/../index.js').clusterClient;

new rcluster.clusterInstance('127.0.0.1:9001', function (err, r) {
	if (err) throw new Error(err);
	
	console.log('connected');
	
	// this.on('error', function(e) {
	// 	console.log('got error from cluster', e);
	// });
	
	var i = 0;
	
	setInterval(function(){
		r.incr('INCR:'+(i++), function(e, data){
			if(e) {
				console.log('Redis error', e);
				return;
			} 
			console.log(data);
		});
	}, 50);
	
});

// setTimeout(function(){
// 	console.log('exit now');
// 	process.exit();
// }, 15000);