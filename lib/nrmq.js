
var amqp = require('amqp'); // https://github.com/postwait/node-amqpvar 
var Rpc = require('amqp-rpc');  // https://github.com/rashtao/node-amqp-rpc.git
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Uuid = require('node-uuid');
var Q = require('q');


var thisModule = function(id, server, exchange, subscriptionRoutingKey, queueName) {
	try {
		var rmq = new NRMQ(id, server, exchange, subscriptionRoutingKey, queueName);
	} catch(error) {
		console.error('---- nrmq Error ---\n', error.stack);
	}
	return rmq;
};

thisModule.NRMQ = NRMQ;
module.exports = thisModule;


function NRMQ(id, server, exchange, subscriptionRoutingKey, queueName) {
	var thisNRMQ = this;
	if (typeof id !== 'string') {
		return new Error('NRMQ: you need to specify an id!');
	}
	if (
		typeof server !== 'object'
		|| typeof server.login !== 'string'
		|| typeof server.password !== 'string'
		|| typeof server.host !== 'string'
		|| typeof server.port !== 'number'
	) {
		throw new Error('NRMQ: you need to specify a server!', id, server);
	}
	if (
		typeof exchange !== 'object'
		|| typeof exchange.type !== 'string'
	) {
		throw new Error('NRMQ: you need to specify an exchange!', id, exchange);
	}
	this.id = id;
	this.server = server;
	this.exchangeOptions = exchange;
	this.exchangeOptions.type = (typeof exchange.type === 'string') ?exchange.type : 'topic';
	this.exchange = null;
	this.queue = null;
	this.queueName = queueName;
	this.subscriptionRoutingKey = subscriptionRoutingKey;
	this.rpc = Rpc.factory(
		{
			conn_options: {
				url: 'amqp://' + this.server.login + ':' + this.server.password + '@' + this.server.host + ':' + this.server.port
			}
		}
	);
	this._readyPromise = Q.defer();
	this._connect();
};
util.inherits(NRMQ, EventEmitter);


// Initialize Publisher --------------------------------------
NRMQ.prototype._connect = function() {
	var thisNRMQ = this;
	this.connection = amqp.createConnection(this.server);
	this.connection.on(
		'ready',
		function() {
			thisNRMQ.emit('connectionReady', thisNRMQ);
			thisNRMQ._onConnectionReady();
			thisNRMQ._readyPromise.resolve(thisNRMQ);
		}
	);
	this.connection.on(
		'close',
		function () {
			thisNRMQ.emit('log', 'Connection CLOSED', 'red', 'nq.' + thisNRMQ.id, 3);
			thisNRMQ.emit('close', arguments, thisNRMQ);
		}
	);
	this.connection.on(
		'error',
		function (err) {
			thisNRMQ.emit('log', 'Connection ERROR', 'red', 'nq.' + thisNRMQ.id, 3);
			thisNRMQ.emit('log', err, 'red', 'nq.' + thisNRMQ.id, 3);
			thisNRMQ.emit('log', err.stack, 'red', 'nq.' + thisNRMQ.id, 3);
			 //console.log(arguments);
			thisNRMQ.emit('err', err, thisNRMQ, arguments);
			thisNRMQ._readyPromise.reject(thisNRMQ);
		}
	);
	return this;
};

NRMQ.prototype._onConnectionReady = function () {
	var thisNRMQ = this;
	thisNRMQ.emit('log', 'Connection ready to : ' + thisNRMQ.id, 'yellow', 'nq.' + thisNRMQ.id, 2);
	thisNRMQ.connection.exchange(
		thisNRMQ.exchangeOptions.name,
		{
			type: thisNRMQ.exchangeOptions.type,
			confirm: thisNRMQ.exchangeOptions.confirm
		},
		function(exchange) {
			thisNRMQ.exchange = exchange;
			thisNRMQ.emit('ready', exchange, thisNRMQ);
		}
	);
};

NRMQ.prototype.publish = function(publicationRoutingKey, msg, args, callback) {
	if( typeof args === 'function' ) {
		callback = args;
		args = {};
	}
	if (!this.exchange) {
		var error = new ReferenceError(
			"NRMQ isn't initialized yet. Wait for `ready` to fire before sending messages."
		);
		if (typeof callback === 'function') {
			return callback(error);
		}
		return error;
	}
	msg = msg || {};
	msg._messageId = msg._messageId || Uuid.v4();
	// this.emit('log', 'Publishing message ' + JSON.stringify(msg));
	this.emit('log', 'Publishing message via  ' + publicationRoutingKey);
	this.exchange.publish(publicationRoutingKey, msg, args, callback);
	return this;
};


NRMQ.prototype.disconnect = function () {
	this.connection.implOptions.reconnect = false;
	this.connection.disconnect();
};


// Initialize Subscription  --------------------------------------
NRMQ.prototype.handleMessage = function(callback) {
	var thisNRMQ = this;
	// Add extra listeners
	thisNRMQ.on('queueReady', thisNRMQ._onQueueReady.bind(thisNRMQ));
	thisNRMQ.on('routingReady', thisNRMQ._onRoutingReady.bind(thisNRMQ));
	// Fire exchange ready directly if event already passed
	if( thisNRMQ.exchange != null ) {
		thisNRMQ._onExchangeReady(thisNRMQ.exchange);
	}
	// Wait for ready to fire otherwise
	else {
		thisNRMQ.on('ready', thisNRMQ._onExchangeReady.bind(thisNRMQ));
	}
	if (typeof callback === 'function') {
		return this.on('msg', callback);
	}
};

NRMQ.prototype._onExchangeReady = function (exchange) {
	var thisNRMQ = this;
	thisNRMQ.emit('log', 'Exchange is open : ' + exchange.name, 'yellow', 'nq.' + thisNRMQ.id, 2);
	thisNRMQ.connection.queue(
		thisNRMQ.queueName,
		{
			confirm: thisNRMQ.exchangeOptions.confirm
		},
		function(q) {
			thisNRMQ.queue = q;
			thisNRMQ.emit('queueReady', q, thisNRMQ);
		}
	);
};

NRMQ.prototype._onQueueReady = function (q) {
	var thisNRMQ = this;
	// Catch messages
	thisNRMQ.emit('log', 'Queue is set : ' + thisNRMQ.queueName, 'yellow', 'nq.' + thisNRMQ.id, 2);
	thisNRMQ.emit('log', 'Attempting subscription to [' + thisNRMQ.queue.name + '|' + thisNRMQ.subscriptionRoutingKey + ']', 'yellow', 'nq.' + thisNRMQ.id, 2);
	thisNRMQ.queue.bind(
		this.exchangeOptions.name,
		thisNRMQ.subscriptionRoutingKey,
		function(q) {
			thisNRMQ.emit('routingReady', q, thisNRMQ);
		}
	);
};

NRMQ.prototype._onRoutingReady = function() {
	var thisNRMQ = this;
	thisNRMQ.emit('log', 'Queue has binding to[' + thisNRMQ.queue.name + '|' + thisNRMQ.subscriptionRoutingKey + ']', 'yellow', 'nq.' + thisNRMQ.id, 2);
	var c = 0;
	thisNRMQ.queue.subscribe(
		{
			ack: true
		},
		function (message) {
			c+=1;
			thisNRMQ.emit('log', 'message #' + c +' incoming  with id=' + message.id, 'red', 'nq.' + thisNRMQ.id, 1);
			thisNRMQ.emit(
				'msg', 
				message, 
				function() {
					thisNRMQ.queue.shift();
				}, 
				thisNRMQ
			);
		}
	);
	thisNRMQ.emit('subscriptionReady', arguments, thisNRMQ);
};

