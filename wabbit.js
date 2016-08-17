import {Meteor} from 'meteor/meteor'

const Rabbot = require('rabbot')
const  _ = require('lodash')
const EventEmitter = require('events').EventEmitter
const ee = new EventEmitter()
const prefix = '[WABBIT]'

let instance = null

class WabbitClass {
  constructor(){
    instance = instance || this
    return instance
  }

  nackOnError(){
    Rabbot.nackOnError()
  }

  get debug(){
    return this._debug || false
  }
  set debug(value){
    this._debug = _.isBoolean(value) ? value : (value)
  }

  get replyWithBody(){
    return this._replyWithBody || false
  }
  set replyWithBody(value){
    this._replyWithBody = _.isBoolean(value) ? value : (value)
  }

  configure(config){
    // NOTE
    // we will return a promise that will resolve
    // after we have fully configured Rabbot AND Wabbit
    // and registered all of the queues and exchanges
    return new Promise((resolve, reject)=>{
      Rabbot.configure(config)
        .done(()=>{
          if( this.debug ){
            console.log(prefix, "Rabbot configured.")
          }

          const {bindings} = config
          if( !bindings || !(bindings instanceof Array) || (bindings.length < 1) ){
            const err = "Wabbit.configure must be passed an [Object]"
            if( this.debug ){
              console.warn(prefix, err)
            }
            reject(new Error(err))
          } else {
            bindings.map((config)=>{
              if( config.exchange ){
                let ex = new this.Exchange(config.exchange)
                if( config.target ){
                  let q = new this.Queue({
                    name: config.target,
                    keys: config.keys
                  })
                  ex.registerQueue(q)
                }
                this.registerExchange(ex)
              }
            })
            // now set up our listener just in case any more exchanges
            // get added after this point
            ee.on('register:exchange', this.runExchange)
            ee.on('register:queue', this.runQueue)
            if( this.debug ){
              console.log(prefix, "Wabbit configured.")
            }
            this.ready = true
            resolve()
          }
        })
    })
  }

  dump(){
    _.values(this.exchanges).map((exchange)=>{
      console.log(JSON.stringify(exchange, true, 2))
      _.values(exchange.queues).map((queue)=>{
        console.log(JSON.stringify(queue, true, 2))
      })
    })
  }

  run(){
    if( !this.ready ){
      const err = 'Wabbit has not been configured! Please make sure you run Wabbit.configure() first.'
      if( this.debug ){
        console.warn(prefix, err)
      }
      throw new Error(err)
    }
    // ensure that all queues handlers are registered with rabbitmq!
    // map all queues
    if( this.debug ){
      console.log(prefix, "Running exchanges...")
    }
    _.values(this.exchanges).map((exchange)=>{
      this.runExchange(exchange)
    })

    // everything is registered (trickle-down...)
    // try to empty our messages in memory this.messages
    if( this.debug ){
      if( _.isArray(this.messages) && this.messages.length ){
        console.log(prefix, "Publishing stored messages.")
      }
    }
    let msg = null
    while( msg = this.messages.shift() ){
      if( msg.type == 'request' ){
        this.request(msg.key, msg.msg)
      } else {
        this.publish(msg.key, msg.msg)
      }
    }
  }

  runExchange(exchange){
    if( this.debug ){
      console.log(prefix, 'Running queues...')
    }
    _.values(exchange.queues).map((queue)=>{
      this.runQueue(queue, exchange)
    })
  }

  runQueue(queue, exchange){
    const startSubscription = (_.isArray(queue.handlers) && queue.handlers.length)
    if( !startSubscription ){
      let key
      while( key = queue.keys.shift() ){
        const route = {
          key,
          exchange: exchange.name,
          queue: queue.name
        }
        this.createRouteMap(route)
      }
    } else {
      queue.handlers.map((handler)=>{
        if( !handler || !handler.key || !handler.handler ){
          return
        }

        const route = {
          key: handler.key,
          exchange: exchange.name,
          queue: queue.name
        }
        this.createRouteMap(route)

        Rabbot
          .handle(handler.key, Meteor.bindEnvironment((msg)=>{
              handler.handler(msg, (result)=>{
                if( msg.properties.headers.reply ){
                  const reply = _.isUndefined(result) || _.isNull(result) ? {result:null} : result
                  msg.reply(reply)
                } else {
                  msg.ack()
                }
              })
            }))
          .catch((err, msg)=>{
            if( this.debug ){
              console.log(prefix, err)
              console.log(prefix, msg)
            }
          })
      })

      // all handlers have been initialized for this queue
      // we can safely start the subscription
      if( this.debug ){
        console.log(prefix, 'Starting subscription on:', queue.name)
      }
      Rabbot.startSubscription(queue.name)
    }
  }

  registerExchange(exchange){
    if( !exchange ){
      return null
    }

    if( this.exchanges[exchange.name] ){
      // we have already registered this exchange...
      // let's do ourselves a solid and register
      // any queues that are registered to this incoming exchange
      _.values(exchange.queues).map((queue)=>{
        this.exchanges[exchange.name].registerQueue(queue)
      })
    } else {
      this.exchanges[exchange.name] = exchange
      ee.emit('register:exchange', this.exchanges[exchange.name])
    }
  }

  request(key, msg){
    if( this.debug ){
      console.log(prefix, 'requested:', key, msg)
    }
    if( !Rabbot ){
      console.warn('Queueing request for delivery when Rabbot is available.')
      this.messages.push(Object.assign({}, {type:'request'}, {key, msg}))
      return
    }

    const route = this.routeMap[key]
    if( _.isNull(route) || _.isUndefined(route) ){
      if( this.debug ){
        console.log(prefix, 'no route mapped for:', key, route)
      }
      return
    }

    const {type, routingKey, exchange, queue} = route
    const options = Object.assign({},{
      routingKey, type,
      body: msg,
      headers: {reply: true},
      replyTimeout: 2000
    })
    if( this.debug ){
      console.log(prefix, 'requesting w/options:', JSON.stringify(options, true, 2))
    }
    return Rabbot.request(exchange, options)
      .then(response =>{
        response.ack()
        return this.replyWithBody ? response.body : response
      })
  }

  publish(key, msg){
    if( this.debug ){
      console.log(prefix, 'published:', key, msg)
    }
    if( !Rabbot ){
      console.warn('Queueing request for delivery when Rabbot is available.')
      this.messages.push(Object.assign({}, {type:'publish'}, {key, msg}))
      return
    }

    const route = this.routeMap[key]
    if( _.isNull(route) || _.isUndefined(route) ){
      if( this.debug ){
        console.log(prefix, 'no route mapped for:', key, route)
      }
      return
    }

    const {type, routingKey, exchange, queue} = route
    const options = Object.assign({},{
      routingKey, type,
      body: msg
    })
    if( this.debug ){
      console.log(prefix, 'publishing w/options:', JSON.stringify(options, true, 2))
    }
    return Rabbot.publish(exchange, options)
  }

  createRouteMap({key, queue, exchange}){
    this.routeMap[key] = {
      queue, exchange,
      routingKey: key,
      type: key
    }
  }

  get routeMap(){
    if( !this._routeMap ){
      this.routeMap = {}
    }
    return this._routeMap
  }
  set routeMap(value){
    this._routeMap = _.isObject(value) ? value : {value}
  }

  get exchanges(){
    if( !this._exchanges ){
      this.exchanges = {}
    }
    return this._exchanges
  }
  set exchanges(value){
    this._exchanges = _.isObject(value) ? value : {value}
  }

  get messages(){
    return this._messages || []
  }
  set messages(value){
    this._messages = _.isArray(value) ? value : [value]
  }

  get ready(){
    return this._ready || false
  }
  set ready(value){
    this._ready = _.isBoolean(value) ? value : (value)
  }

  ///////////////////////////////////////////
  //
  // a class within a class!
  //
  get Exchange(){
    return class {
      constructor(name){
        this.name = name
      }

      registerQueue(queue){
        if( !queue ){
          return null
        }

        // we have already registered this queue...
        // let's do ourselves a solid and add any
        // routing keys and handlers that are listed in the incoming queue
        if( this.queues[queue.name] ){
          // keys
          let keys = this.queues[queue.name].keys.concat(queue.keys)
          keys.sort()
          this.queues[queue.name].keys = _.uniq(keys, true)
          // handlers
          Array.prototype.push.apply(this.queues[queue.name].handlers, queue.handlers)
        } else {
          this.queues[queue.name] = queue
          ee.emit('register:queue', this.queues[queue.name])
        }
      }

      getQueue(name){
        return this.queues[name]
      }

      get name(){
        return this._name
      }
      set name(value){
        this._name = _.isString(value) ? value : value.toString()
      }

      get queues(){
        if( !this._queues ){
          this.queues = {}
        }
        return this._queues
      }
      set queues(value){
        this._queues = _.isObject(value) ? value : {value}
      }
    }
  }

  ///////////////////////////////////////////
  //
  // a class within a class!
  //
  get Queue(){
    return class {
      constructor(opts){
        this.name = opts.name
        this.keys = opts.keys
      }

      registerHandler(opts){
        if( !opts || !_.isObject(opts) ){
          throw new Error(500, `Queue.handler options must be an [Object] with properties {key, handler}`)
        }

        const {key, handler} = opts
        if( !key || !this.hasKey(key) ){
          throw new Error(501, `Queue.handler routing key [${key}] is not available on this queue`)
        }
        if( !handler || !_.isFunction(handler) ){
          throw new Error(502, `Queue.handler handler function must be of type [Function]`)
        }

        this.handlers.push({key, handler})
      }

      get name(){
        return this._name
      }
      set name(value){
        this._name = _.isString(value) ? value : value.toString()
      }

      get keys(){
        if( !this._keys ){
          this.keys = []
        }
        return this._keys
      }
      set keys(value){
        this._keys = _.isArray(value) ? value : [value]
      }

      hasKey(key){
        return (this.keys.indexOf(key) > -1)
      }

      get handlers(){
        if( !this._handlers ){
          this.handlers = []
        }
        return this._handlers
      }
      set handlers(value){
        this._handlers = _.isArray(value) ? value : [value]
      }
    }
  }
}

const Wabbit = new WabbitClass()
export {Wabbit}