var util = require('util');
var EventEmitter = require('events').EventEmitter;
var redisCommands = require(__dirname+'/lib/commands.js');

var FastRedis = null;
try {
	FastRedis = require('redis-fast-driver');
} catch(e) {}

var RegularRedis = require('redis');

function RedisCluster(firstLink, options, cb) {
	var self = this;
	this.initialCallback = cb;
	this.options = options;
	this.queue = [];
	this.topology = {
		slots: {},
		nodes: {}
	};
	this.cmdId = 0;
	this.connected = false;
	this.renewTopologyInProgress = false;
	
	this.cacheLinks = {};
	this.firstLink = firstLink;
	
	var first = this.getRedisClient(firstLink.host, firstLink.port, options.auth, options);
	
	first.on('ready', function(){
		self.waitForTopology();
	});
}

util.inherits(RedisCluster, EventEmitter);

RedisCluster.prototype.getRedisClient = function getRedisClient(host, port, auth, options) {
	var self = this;
	var key = host+':'+port;
	if(key in this.cacheLinks) {
		return this.cacheLinks[key];
	}
	var link;
	
	if(!FastRedis || options.useFallbackDriver) {
		link = RegularRedis.createClient(port, host, options);
		link.rawCall = function mockRawCall(args, cb) {
			var cpArgs = args.slice(0);
			var cmd = cpArgs.shift();
			link.send_command(cmd, cpArgs, cb);
		};
	} else {
		link = new FastRedis({
			host: host,
			port: port,
			auth: auth
		});
	}
	link._queue = {};
	this.cacheLinks[key] = link;
	link.on('error', function(err){
		link.name = link.name || link.host+':'+link.port;
		console.log('Got error from link `%s`, err:', link.name, err);
		self.connected = false;
		var queue = link._queue;
		link._queue = {};
		var id = link.id;
		link.end();
		delete self.cacheLinks[key];
		delete self.topology.nodes[id];
		for(var i=0;i<16384;i++) {
			if(self.topology.slots[i] === id) {
				delete self.topology.slots[i];
			}
		}
		var keys = Object.keys(queue);
		keys.reverse();
		for(var i=0;i<keys.length;i++) {
			self.queue.unshift(queue[keys[i]]);
		}
		self.waitForTopology();
	});
	
	return link;
};

RedisCluster.prototype.toString = function(){
	return 'RedisCluster '+JSON.stringify(this.topology.nodes, null, '\t');
};
	
RedisCluster.prototype.calcSlot = (function crc16Init(){
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
	
	var BUF_SIZE = 1024;
	var buf = new Buffer(BUF_SIZE);
	
	function utf8BytesLength(string) {
		var utf8length = 0, c = 0;
		for (var n = 0; n < string.length; n++) {
			c = string.charCodeAt(n);
			if (c < 128) {
				utf8length++;
			}
			else if((c > 127) && (c < 2048)) {
				utf8length = utf8length+2;
			}
			else {
				utf8length = utf8length+3;
			}
		}
		return utf8length;
	}
	
	return function crc16XModem(str){
		var len = utf8BytesLength(str);
		var b = buf;
		if(len < BUF_SIZE) {
			b.write(str, 0, len, 'utf8');
		} else {
			b = new Buffer(str, 'utf8');
		}
		var crc = 0;
		for(var i = 0; i < len; i++) {
			crc = crc16Add(crc, b.readUInt8(i));
		}
		return crc % 16384;
	}
})();

RedisCluster.prototype.rawCall = function rawCall(args, cb, options) {
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
	var key, start, end;
	if(args.length > 1) {
		key = args[1].toString();
		start = key.indexOf('{');
		if(start !== -1) {
			end = key.indexOf('}', start);
			if(end !== -1 && end - start -1 > 0) {
				key = key.substr(start+1, end-start-1);
			}
		}
		targetSlot = this.calcSlot(key);
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
		this.waitForTopology();
		
		return this;
	}
	var link = this.topology.nodes[targetId];
	if(this.topology.nodes[targetId].link === null) {
		this.topology.nodes[targetId].link = this.getRedisClient(this.topology.nodes[targetId].host, this.topology.nodes[targetId].port, this.options.auth, this.options);
	}
	link = link.link;
	var cmdId = self.cmdId++;
	
	if(args[0].toUpperCase() === 'HMSET' && typeof args[2] === 'object') {
		var obj = args.splice(2, 1)[0];
		for(var k in obj) {
			args.push(k);
			args.push(obj[k]);
		}
	}
	
	link._queue[cmdId] = {
		args: args,
		cb: cb
	};
	link.rawCall(args, onResponse);
	
	function onResponse(e, resp, size){
		if(typeof size === 'undefined') size = -1;
		if(link && link._queue) {
			if(typeof link._queue[cmdId] !== 'undefined') {
				link._queue[cmdId].cb = null;
				link._queue[cmdId].args = null;
			}
			link._queue[cmdId] = null;
			delete link._queue[cmdId];
		}
		if(e) {
			var e = e.toString();
			if(e.substr(0,3) === 'ASK') {
				var target = e.split(' ')[2];
				var linkNew = self.getRedisClient(target.split(':')[0], target.split(':')[1], self.options.auth, self.options);
				linkNew.rawCall(['ASKING']);
				linkNew.rawCall(args, onResponse);
				return;
			}
			//MOVED 7365 127.0.0.1:7001
			if(e.substr(0, 5) === 'MOVED') {
				//this probably mean that cluster topology is changed
				self.queue.unshift({
					args: args,
					cb: cb
				});
				self.waitForTopology();
				return self;
			}
			if(typeof cb !== 'undefined') {
				cb(e, undefined, size);
			} else {
				console.log('Redis cluster, unhandled error', args, e);
			}
			return;
		}
		if(typeof cb !== 'undefined') {
			if(args[0].toUpperCase() === 'HMGET' && Array.isArray(resp)) {
				if(resp.length > 0) {
					var t = resp;
					resp = {};
					for(var i=2; i<args.length;i++) {
						resp[args[i]] = t[i-2];
					}
				} else {
					resp = null;
				}
			} else if(args[0].toUpperCase() === 'HGETALL' && Array.isArray(resp)) {
				if(resp.length > 0) {
					var t = resp;
					resp = {};
					for(var i=0;i<t.length;i+=2) {
						resp[t[i]] = t[i+1];
					}
				} else {
					resp = null;
				}
			}
			cb(null, resp, size);
		}
	}
	
	return this;
};
	
RedisCluster.prototype.waitForTopology = function waitForTopology(){
	var self = this;
	if(this.renewTopologyInProgress) return;
	this.connected = false;
	this.renewTopologyInProgress = true;
	this.topology.slots = {};
	this.topology.nodes = {};
	
	var self = this;
	var connectStr;
	var link;
	init();
	function init(){
		connectStr = Object.keys(self.cacheLinks)[0];
		if(typeof connectStr === 'undefined') {
			self.emit('error', 'No masters known');
			var first = self.getRedisClient(self.firstLink.host, self.firstLink.port, self.options.auth, self.options);
	
			first.on('ready', function(){
				self.waitForTopology();
			});
			
			self.renewTopologyInProgress = false;
			return;
		}
		link = self.cacheLinks[connectStr];
		link.rawCall(['CLUSTER', 'NODES'], onGetTopology);
	}
	
	function onGetTopology(e, nodes) {
		if(e) {
			delete self.cacheLinks[connectStr];
			self.emit('error', e);
			setTimeout(init, 1000);
			return;
		}
		self.topology.slots = {};
		self.topology.nodes = {};
		// console.log(nodes);
		nodes.split('\n').forEach(parseLine);
		// console.log(self.topology.nodes);
		if(Object.keys(self.topology.slots).length !== 16384) {
			setTimeout(init, 1000);
			return;
		}
		self.connected = true;
		self.renewTopologyInProgress = false;
		if(self.queue.length > 0)
			self.ping();
		self.emit('ready');
		if(self.initialCallback) {
			var cb = self.initialCallback;
			self.initialCallback = null;
			cb(null, self);
		}
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
		
		if(flags.indexOf('fail?') !== -1 || flags.indexOf('fail') !== -1) {
			delete self.topology.nodes[id];
			return;
		}
		
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
			if(cache[i].indexOf('-<-') !== -1) continue;
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
};
RedisCluster.prototype.end = function end() {
	this.connected = false;
	this.topology.slots = {};
	for(var k in this.cacheLinks) {
		this.cacheLinks[k].end();
	}
	this.cacheLinks = {};
	this.topology.nodes = {};
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
				firstLink.port = parseInt(options.split(':')[1]);
			} else if(typeof options === 'object' && !Array.isArray(options)) {
				for(var k in options) {
					settings[k] = options[k];
				}
				firstLink = {
					host: options.host,
					port: options.port
				};
				return new RedisCluster(firstLink, settings, cb);
			} else {
				return cb('Unsupported options');
			}
			return new RedisCluster(firstLink, settings, cb);
		}
	}
};
