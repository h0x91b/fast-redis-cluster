var redisCommands = require(__dirname+'/lib/commands.js');

var fastRedis = null;
try {
	fastRedis = require('redis-fast-driver');
} catch(e) {}

function getRedisClient(host, port, auth, options) {
	var link = new fastRedis({
		host: host,
		port: port,
		auth: auth
	});
	return link;
}

function RedisCluster(firstLink, options, cb) {
	var self = this;
	this.reconnectInterval = 1000;
	this.reconnecting = null;
	this.options = options;
	this.queue = [];
	this.topology = {
		slots: {},
		nodes: {},
		knownNodes: {}
	};
	this.connected = false;
	
	var first = getRedisClient(firstLink.host, firstLink.port, options.auth, options);
	var once = false;
	
	first.on('error', function(str){
		if(!once) return cb(str);
		once = true;
		self.connected = false;
		self.reconnect();
	});
	
	first.on('ready', function(){
		console.log('connected');
		self.getClusterNodes(first, cb);
	});
}

RedisCluster.prototype = {
	calcSlot: (function crc16Init(){
		var CRC16_TAB = [
			// unsigned short CRC16_TAB[] = {...};
			0x0000,0x1021,0x2042,0x3063,0x4084,0x50a5,0x60c6,0x70e7,
			0x8108,0x9129,0xa14a,0xb16b,0xc18c,0xd1ad,0xe1ce,0xf1ef,
			0x1231,0x0210,0x3273,0x2252,0x52b5,0x4294,0x72f7,0x62d6,
			0x9339,0x8318,0xb37b,0xa35a,0xd3bd,0xc39c,0xf3ff,0xe3de,
			0x2462,0x3443,0x0420,0x1401,0x64e6,0x74c7,0x44a4,0x5485,
			0xa56a,0xb54b,0x8528,0x9509,0xe5ee,0xf5cf,0xc5ac,0xd58d,
			0x3653,0x2672,0x1611,0x0630,0x76d7,0x66f6,0x5695,0x46b4,
			0xb75b,0xa77a,0x9719,0x8738,0xf7df,0xe7fe,0xd79d,0xc7bc,
			0x48c4,0x58e5,0x6886,0x78a7,0x0840,0x1861,0x2802,0x3823,
			0xc9cc,0xd9ed,0xe98e,0xf9af,0x8948,0x9969,0xa90a,0xb92b,
			0x5af5,0x4ad4,0x7ab7,0x6a96,0x1a71,0x0a50,0x3a33,0x2a12,
			0xdbfd,0xcbdc,0xfbbf,0xeb9e,0x9b79,0x8b58,0xbb3b,0xab1a,
			0x6ca6,0x7c87,0x4ce4,0x5cc5,0x2c22,0x3c03,0x0c60,0x1c41,
			0xedae,0xfd8f,0xcdec,0xddcd,0xad2a,0xbd0b,0x8d68,0x9d49,
			0x7e97,0x6eb6,0x5ed5,0x4ef4,0x3e13,0x2e32,0x1e51,0x0e70,
			0xff9f,0xefbe,0xdfdd,0xcffc,0xbf1b,0xaf3a,0x9f59,0x8f78,
			0x9188,0x81a9,0xb1ca,0xa1eb,0xd10c,0xc12d,0xf14e,0xe16f,
			0x1080,0x00a1,0x30c2,0x20e3,0x5004,0x4025,0x7046,0x6067,
			0x83b9,0x9398,0xa3fb,0xb3da,0xc33d,0xd31c,0xe37f,0xf35e,
			0x02b1,0x1290,0x22f3,0x32d2,0x4235,0x5214,0x6277,0x7256,
			0xb5ea,0xa5cb,0x95a8,0x8589,0xf56e,0xe54f,0xd52c,0xc50d,
			0x34e2,0x24c3,0x14a0,0x0481,0x7466,0x6447,0x5424,0x4405,
			0xa7db,0xb7fa,0x8799,0x97b8,0xe75f,0xf77e,0xc71d,0xd73c,
			0x26d3,0x36f2,0x0691,0x16b0,0x6657,0x7676,0x4615,0x5634,
			0xd94c,0xc96d,0xf90e,0xe92f,0x99c8,0x89e9,0xb98a,0xa9ab,
			0x5844,0x4865,0x7806,0x6827,0x18c0,0x08e1,0x3882,0x28a3,
			0xcb7d,0xdb5c,0xeb3f,0xfb1e,0x8bf9,0x9bd8,0xabbb,0xbb9a,
			0x4a75,0x5a54,0x6a37,0x7a16,0x0af1,0x1ad0,0x2ab3,0x3a92,
			0xfd2e,0xed0f,0xdd6c,0xcd4d,0xbdaa,0xad8b,0x9de8,0x8dc9,
			0x7c26,0x6c07,0x5c64,0x4c45,0x3ca2,0x2c83,0x1ce0,0x0cc1,
			0xef1f,0xff3e,0xcf5d,0xdf7c,0xaf9b,0xbfba,0x8fd9,0x9ff8,
			0x6e17,0x7e36,0x4e55,0x5e74,0x2e93,0x3eb2,0x0ed1,0x1ef0
		];
		
		function crc16Add(crc,c) {
			return CRC16_TAB[
				(
					(crc>>8)
					^ c
				) & 0xFF
			] ^ (
				(crc<<8)
				& 0xFFFF
			);
		};
		
		return function crc16XModem(str){
			var b = new Buffer(str, 'utf8');
			var crc = 0;
			for(var i = 0; i < b.length; i++) {
				crc = crc16Add(crc, b.readUInt8(i));
			}
			return crc % 16384;
		}
	})(),
	getClusterNodes: function(link, cb) {
		var self = this;
		link.rawCall(['CLUSTER', 'INFO'], onStatus);
		
		function onStatus(err, data) {
			if(err) return cb(err);
			if(data.indexOf('cluster_state:ok') === -1) {
				console.log('cluster down', data);
				return cb('Cluster is down', data);
			}
			link.rawCall(['CLUSTER', 'NODES'], onGet);
		}
		
		function onGet(e, nodes) {
			if(e) {
				link.end();
				cb(e);
				return;
			}
			self.topology.slots = {};
			self.topology.nodes = {};
			// console.log(nodes);
			nodes.split('\n').forEach(parseLine);
			// console.log(self.topology.nodes);
			if(Object.keys(self.topology.slots).length !== 16384) {
				link.end();
				cb('Cluster is down');
				return;
			}
			self.reconnectInterval = 1000;
			console.log('all ok');
			if(self.reconnecting) {
				clearTimeout(self.reconnecting);
			}
			self.reconnecting = null;
			self.connected = true;
			if(self.queue.length > 0)
				self.ping();
			cb(null, self);
		}
		
		function parseLine(line) {
			if(!line) return;
			var cache = line.split(' ');
			var id = cache[0];
			var linkStr = cache[1];
			var host = cache[1].split(':')[0];
			var port = cache[1].split(':')[1];
			var flags = cache[2].split(',');
			var isConected = cache[7] === 'connected';
			
			self.topology.nodes[id] = {
				id: id,
				linkStr: linkStr,
				flags: flags,
				host: host,
				port: port,
				link: null,
				isSlave: false
			};
			
			self.topology.knownNodes[id] = self.topology.nodes[id];
			
			if(flags.indexOf('myself') !== -1) {
				self.topology.nodes[id].link = link;
			}
			
			if(flags.indexOf('slave') !== -1) {
				self.topology.nodes[id].isSlave = true;
				return;
			}
			
			if(!isConected) return;
			
			var from, to;
			for(var i=8;i<cache.length;i++){
				if(cache[i].indexOf('-') === -1) {
					self.topology.slots[cache[i]] = id;
					continue;
				}
				from = parseInt(cache[i].split('-')[0]);
				to = parseInt(cache[i].split('-')[1]);
				for(var n=from;n<=to;n++) {
					self.topology.slots[n] = id;
				}
			}
		}
	},
	rawCall: function(args, cb, options) {
		var self = this;
		if(!Array.isArray(args)) {
			throw new Error('First argument must be Array');
		}
		if(!this.connected) {
			this.queue.push({
				args: args,
				cb: cb
			});
			
			return this;
		}
		
		if(this.queue.length > 0) {
			var queue = this.queue;
			this.queue = [];
			queue.forEach(function(q){
				self.rawCall(q.args, q.cb);
			});
		}
		
		var targetSlot = 0;
		if(args.length > 1) {
			targetSlot = this.calcSlot(args[1].toString());
		}
		
		if(typeof options !== 'undefined' && typeof options.targetSlot !== 'undefined') {
			targetSlot = options.targetSlot;
		}
		
		var targetId = this.topology.slots[targetSlot];
		if(typeof targetId === 'undefined' || typeof this.topology.nodes[targetId] === 'undefined') {
			this.connected = false;
			//throw new Error('Target slot '+targetSlot+' not found on any node, check your cluster');
			this.queue.unshift({
				args: args,
				cb: cb
			});
			this.reconnect();
			
			return this;
		}
		var link = this.topology.nodes[targetId];
		if(!link.link) {
			link.link = getRedisClient(link.host, link.port, self.options.auth, {});
			link.link.on('error', function(err){
				console.log('got error "%s" from one of links', err, link.name);
				link.queue = [];
				self.queue.unshift({
					args: args,
					cb: cb
				});
				self.reconnect();
			});
		}
		link = link.link;
		
		link.rawCall(args, function(e, resp){
			if(e) {
				//MOVED 7365 127.0.0.1:7001
				if(e.toString().substr(0, 5) === 'MOVED') {
					//this probably mean that cluster topology is changed
					self.queue.unshift({
						args: args,
						cb: cb
					});
					self.reconnect();
					return self;
				}
				if(typeof cb !== 'undefined') {
					cb(e);
				} else {
					console.log('Redis cluster, unhandled error', args, e);
				}
				return;
			}
			if(typeof cb !== 'undefined') {
				cb(null, resp);
			}
		});
		
		return this;
	},
	reconnect: function(){
		var self = this;
		if(this.reconnecting) {
			clearTimeout(this.reconnecting);
		}
		this.reconnecting = null;
		this.connected = false;
		this.topology.slots = {};
		for(var k in this.topology.nodes) {
			if(this.topology.nodes[k].link)
				this.topology.nodes[k].link.end();
		}
		this.topology.nodes = {};
		var first = null;
		for(var id in this.topology.knownNodes) {
			first = this.topology.knownNodes[id];
			delete this.topology.knownNodes[id];
			break;
		}
		if(!first) {
			throw new Error('There is no more nodes found, can not reconnect');
		}
		//cold down for 1 sec and reconnect
		this.reconnecting = setTimeout(function(){
			console.log('reconnect to', first.linkStr);
			first.link = getRedisClient(first.host, first.port, self.options.auth, {});
			first.link.on('error', function(err){
				console.log('got error "%s" from one of links', err, first.link.name);
				if(self.connected) self.reconnect();
			});
			self.getClusterNodes(first.link, function(e){
				if(e) {
					console.log('getClusterNodes failed', e);
					self.reconnect();
				}
			});
		}, self.reconnectInterval);
		self.reconnectInterval*=2;
		if(self.reconnectInterval > 30000) {
			self.reconnectInterval = 30000;
		}
	},
	end: function end() {
		this.connected = false;
		this.topology.slots = {};
		for(var k in this.topology.nodes) {
			if(this.topology.nodes[k].link)
				this.topology.nodes[k].link.end();
		}
		this.topology.nodes = {};
	}
};

function redisCmdWrap(cmd) {
	return function redisCmd() {
		var args = Array.prototype.slice.call(arguments, 0);
		args.unshift(cmd);
		var cb = undefined;
		if(typeof args[args.length - 1] === 'function') {
			cb = args.pop();
		}
		
		if(cmd === 'hmset' && typeof args[args.length - 1] === 'object') {
			var o = args.pop();
			for(var k in o) {
				args.push(k);
				args.push(o[k]);
			}
		}
		return this.rawCall(args, cb);
	}
};

redisCommands.forEach(function(cmd){
	RedisCluster.prototype[cmd] = redisCmdWrap(cmd);
});

module.exports = {
	RedisCluster: RedisCluster,
	clusterClient: {
		clusterInstance: function(options, cb) {
			var firstLink = {
				host: '127.0.0.1',
				port: 7001
			};
			var settings = {
				auth: null
			};
			if(typeof options === 'string') {
				firstLink.host = options.split(':')[0];
				firstLink.port = options.split(':')[1];
			} else if(typeof options === 'object' && Array.isArray(options)) {
				return new RedisCluster(options, settings, cb);
			} else {
				return cb('Unsupported options');
			}
			return new RedisCluster(firstLink, settings, cb);
		}
	}
};
