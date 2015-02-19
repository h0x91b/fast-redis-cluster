var rcluster = require(__dirname+'/../index.js').clusterClient;

new rcluster.clusterInstance('127.0.0.1:7001', function (err, r) {
	if (err) throw new Error(err);
	
	console.log('connected');
	
	var i = 0;
	
	setInterval(function(){
		r.incr('INCR:'+(i++), function(e, data){
			if(e) throw new Error(e);
		});
	}, 50);
	
	setTimeout(function(){
		console.log('exit now');
		process.exit();
	}, 60000);
});