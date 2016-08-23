Wabbit
===============

Simplify working with RabbitMQ - built on top of Rabbot

## Dependencies
* [lodash](https://www.npmjs.com/package/lodash)
* [rabbot](https://github.com/arobson/rabbot)

## Usage
1. `npm install --save wabbit`
2. Use this on the server only!

## Configuration
Configure `Wabbit` with the config vars that you would pass to `Rabbot` when configuring that service.
*see [Rabbot README](https://github.com/arobson/rabbot) for config options*
```javascript
const Wabbit = require('wabbit')
// Wabbit.nackOnError()
// Wabbit.debug = true

Wabbit.rejectUnhandled() // only if a dead-letter exchange is defined
Wabbit.rejectOnError = true // only if a dead-letter exchange is defined
Wabbit.replyWithBody = true
Wabbit.configure(config)
  .then(()=>{ Wabbit.run() })
```

## Properties
*debug* (boolean)
This option, when true, will console.log a bunch of information as Wabbit is carrying out its operations.

*rejectOnError* (boolean)
This option, when true, will `reject` a message if there is an error.  This should only be used when there is a [dead-letter exchange defined](https://github.com/arobson/rabbot#rejectunhandled).

*replyWithBody* (boolean)
This option, when true, will send back the `reply.body` instead of the full `reply` object from `Wabbit.request`.


## Methods (server)
You can set up your message handlers like this:
```javascript
const Wabbit = require('wabbit'),
  ex = new Wabbit.Exchange('data-source-ex.1'),
  readQueue = new Wabbit.Queue({
    name: 'read-queue.1',
    keys: 'read-from-data-source'
  })
  
readQueue.registerHandler({
  key: 'read-from-data-source',
  handler(msg, ack){
    // ...
    // do something with the msg.body as per Wascally docs
    //
    
    if( some_error_condition ){
      msg.reject()
      // or
      msg.nack()
    }
    
    // ack this message from the queue and send back a reply if
    // this message was sent with Wabbit.request (no reply if sent with Wabbit.publish)
    ack('this message has been handled!')
  })
})

ex.registerQueue(readQueue)
```

Then you send messages to it like this:
```javascript
Wabbit.request('read-from-data-source', {some: 'data'})
  .then((response)=>{
    // NOTE:
    // if Wabbit.replyWithBody = true =>
    // the "response" you are getting here is actually the "reply.body"
    // of the reply from your consumer.  the original reply has already
    // been ack'd at this point, and the body sent back to this promise
  
    console.log(response)
    // => "this message has been handled!"
  })
```
... or, if you do not need to know when the action has been completed...
```javascript
Wabbit.publish('read-from-data-source', {more: 'data'})
```

## Reading
* [Rabbot](https://github.com/arobson/rabbot)
* [RabbitMQ](https://www.rabbitmq.com/)