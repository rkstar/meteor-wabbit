Wabbit
===============

Simplify working with RabbitMQ - built on top of Wascally

## Package Dependencies
* meteor 1.2.0.2 (uses es2015 syntax)
* promise
* underscore
* ecmascript
* reactive-var
* [wascally (0.2.7)](https://github.com/LeanKit-Labs/wascally)

## Usage
1. `meteor add rkstar:wabbit`
2. Use inside `Meteor.method()` calls only! Future versions may allow you to make calls directly from the client, but this is server only for now.

## Configuration
Configure `Wabbit` with the `Wascally` config file you used when configuring that service (`Wabbit` only needs the 'bindings'):
*see [Wascally README](https://github.com/LeanKit-Labs/wascally) for config options*
```javascript
Wascally.configure(config)
  .done(()=>{
    console.log('Wascally configured')
    Wabbit.configure(config.bindings)
      .then(()=>{
        console.log('Wabbit configured')
        Wabbit.run(Wascally)
        console.log('Wabbit initialized')
      })
  })
```

## Methods (server)
You can set up your message handlers like this:
```javascript
let ex = new Wabbit.Exchange('data-source-ex.1')
let readQueue = new Wabbit.Queue({
  name: 'read-queue.1',
  keys: 'read-from-data-source'
})
  
read.registerHandler({
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
  .then(Meteor.bindEnvironment((response)=>{
    // using Meteor.bindEnvironment is only necessary if you need to have
    // access to the Meteor environment (or collections) inside this function
    console.log(response)
    // => "this message has been handled!"
  }))
```
... or, if you do not need to know when the action has been completed...
```javascript
Wabbit.publish('read-from-data-source', {more: 'data'})
```

## Reading
[Wascally](https://github.com/LeanKit-Labs/wascally)
[RabbitMQ](https://www.rabbitmq.com/)
[Meteor.bindEnvironment](https://www.eventedmind.com/feed/meteor-what-is-meteor-bindenvironment)