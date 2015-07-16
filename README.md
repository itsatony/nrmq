# nrmq
a rabbitMQ communication wrapper for queues and rpc


## example

### instantiation
it is essential to understand that 1 instance of nrmq is bound to
- exactly 1 server + login
- for MESSAGES: exactly to 1 exchange and 1 queue(-name)
- for RPC to the server + login (independent of exchange and queue-name)


````
// Include the nq module
var NRMQ = require('nrmq');

// Specify the RabbitMQ connection
var server = {
    host: '192.168.1.140',
    port: 5672,
    login: '****',
    password: '****'
};

// Define the exchange name and type
var exchange = {
    name: 'amq.topic',
    type: 'topic'
};

// nrmq will automatically subscribe to this key.
var subscriptionRoutingKey = 'NRMQ.demo';

// Create the nrmq instance
var myMQ = NRMQ('myMQId', server, exchange, subscriptionRoutingKey);

// Wait until the connection is established
myMQ.on(
	'ready', 
	function() {
	}
);
````


## handling messages:  nrmq.handleMessage(handler)
````
myMQ.handleMessage(
	function(message, next) {
		console.log("Received message", message);
		// **Important!**
		// Call once done handling a message to get the next message.
		next();
	}
);
````

## publishing messages:  nrmq.publish(routingKey, msg [, args] [, callback])
Function to send a message to the used exchange with the given routing key. 
args and callback are optional parameters. 
args is an object that accepts all attributes specified by the publish api [https://github.com/postwait/node-amqp#exchangepublishroutingkey-message-options-callback]. 
The callback will be called once the message has been delivered and taken care of.
````
myMQ.publish(
	'myPublicationRoute', 
	{
		some: 'message'
	}, 
	{}, 
	function() {
		console.log('message sent');
	}
);
````


## RPC Server:  nrmq.rpc.on(route, handler)
Define an endpoint for rpc calls.
````
myMQ.rpc.on(
	'myRPC',
	function(data, reply, info) {
		console.log('rpc received! ', data, info);
		return reply({ error: null, result: true });		
	}
);
````


## RPC Client:  nrmq.rpc.call(route, data, replyHandler)
Query an rpc and handle the answer.
````
myMQ.rpc.call(
	'myRPC',
	{ hello: 'world' },
	function(answer) {
		console.log('rpc reply received! ', answer);
	}
);
````



