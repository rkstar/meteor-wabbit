let Fiber = Npm.require('fibers'),
  instance = null,
  EventEmitter = Npm.require('events').EventEmitter,
  ee = new EventEmitter()

class WabbitMQ {
  constructor(){
    // this class will be a singleton
    instance = instance || this
    return instance
  }

  // returns a promise object
  configure(bindings){
    // NOTE:
    // the ${config} being passed in here is expected
    // to be in the format of wascally config.bindings array!
    return new Promise((resolve, reject)=>{
      if( !bindings || !(bindings instanceof Array) || (bindings.length < 1) ){
        reject(new Meteor.Error(500, `Wabbit.configure must be passed an [Object]`))
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
        resolve()
      }
    })
  }

  run(rabbit){
    if( !rabbit ){
      throw new Meteor.Error(500, `RABBIT service is unavailable! Please make sure you run rabbit.configure() first!`)
    }
    this.rabbit = rabbit
    this.ready = true
    // try to empty our messages in memory this.messages
    //this.messages.map((m)=>{
    //  (m.type == 'request')
    //    ? this.request(m.key, m.msg)
    //    : this.publish(m.key, m.msg)
    //})
    // ensure that all queues handlers are registered with rabbitmq!
    // map all queues
    _.values(this.exchanges).map((exchange)=>{
      this.runExchange(exchange)
    })
  }

  dump(){
    _.values(this.exchanges).map((exchange)=>{
      console.log(exchange)
      _.values(exchange.queues).map((queue)=>{
        console.log(queue)
      })
    })
  }

  runExchange(exchange){
    _.values(exchange.queues).map((queue)=>{
      this.runQueue(queue, exchange)
    })
  }

  runQueue(queue, exchange){
    if( !queue.handlers || (queue.handlers.length < 1) ){
      return
    }
    queue.handlers.map((handler)=>{
      if( !handler || !handler.key || !handler.handler ){
        return
      }
      this.routeMap[handler.key] = {
        routingKey: handler.key,
        type: handler.key,
        exchange: exchange.name,
        queue: queue.name
      }

      this.rabbit.handle(handler.key, (msg)=>{
        Fiber(()=>{
          // this extra arg passed to our handlers will
          // allow the handler to easily know whether or not
          // it has to reply to a request
          let reply = (msg.properties.replyTo && (msg.properties.replyTo != ''))
          handler.handler(msg, reply)
        }).run()
      })
    })
    // all handlers have been init'd for this queue
    this.rabbit.startSubscription(queue.name)
  }

  registerExchange(exchange){
    if( !exchange ){
      return null
    }
    if( this.exchanges[exchange.name] ){
      // we have already registered this exchange...
      // let's do ourselves a solid and register
      // any queues that are registered the incoming exchange
      _.values(exchange.queues).map((q)=>{
        this.exchanges[exchange.name].registerQueue(q)
      })
    } else {
      this.exchanges[exchange.name] = exchange
      ee.emit('register:exchange', this.exchanges[exchange.name])
    }
  }

  request(key, msg){
    if( !this.rabbit ){
      console.warn(`queueing request for delivery when rabbit is available.`)
      this.messages.push(_.extend({type:'request'}, {key, msg}))
      return
    }
    let map = this.routeMap[key]
    return this.rabbit.request(map.exchange, _.extend({
      body: msg
    }, _.pick(map, ['routingKey','type'])))
  }

  publish(key, msg){
    if( !this.rabbit ){
      console.warn(`queueing request for delivery when rabbit is available.`)
      this.messages.push(_.extend({type:'publish'}, {key, msg}))
      return
    }
    let map = this.routeMap[key]
    return this.rabbit.publish(map.exchange, _.extend({
      body: msg
    }, _.pick(map, ['routingKey','type'])))
  }

  get routeMap(){
    if( !this._routeMap ){
      this.routeMap = {}
    }
    return this._routeMap
  }
  set routeMap(value){
    if( !(value instanceof Object) ){
      throw new Meteor.Error(500, `Wabbit.routeMap must be of type [Object] : ${value}`)
    }
    this._routeMap = value
  }

  get exchanges(){
    if( !this._exchanges ){
      this._exchanges = {}
    }
    return this._exchanges
  }
  set exchanges(value){
    if( !_.isObject(value) ){
      throw new Meteor.Error(500, `Wabbit.exchanges must be of type [Object] : ${value}`)
    }
    this._exchanges = value
  }

  get rabbit(){
    return this._rabbit
  }
  set rabbit(value){
    this._rabbit = value
  }

  get ready(){
    if( !this._ready ){
      this.ready = false
    }
    return this._ready.get()
  }
  set ready(value){
    if( !_.isBoolean(value) ){
      throw new Meteor.Error(500, `Wabbit.ready must be a [Boolean] value: ${value}`)
    }
    if( typeof this._ready == 'undefined' ){
      this._ready = new ReactiveVar()
    }
    this._ready.set(value)
  }

  get messages(){
    if( !this._messages ){
      this.messages = []
    }
    return this._messages
  }
  set messages(value){
    if( !_.isArray(value) ){
      throw new Meteor.Error(500, `Wabbit.messages must be of type [Array] : ${value}`)
    }
    this._messages = value
  }

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
        if( !_.isString(value) ){
          throw new Meteor.Error(500, `Exchange.name must be of type [String] : ${value}`)
        }
        this._name = value
      }

      get queues(){
        if( !this._queues ){
          this.queues = {}
        }
        return this._queues
      }
      set queues(value){
        if( !_.isObject(value) ){
          throw new Meteor.Error(500, `Exchange.queues must be of type [Object] : ${value}`)
        }
        this._queues = value
      }
    }
  }

  get Queue(){
    return class {
      constructor(opts){
        this.name = opts.name
        this.keys = opts.keys
      }

      registerHandler(opts){
        if( !opts || !(opts instanceof Object) ){
          throw new Meteor.Error(500, `Queue.handler options must be an [Object] with properties {key, handler}`)
        }
        if( !opts.key || (this.keys.indexOf(opts.key) == -1) ){
          throw new Meteor.Error(500, `Queue.handler routing key [${opts.key}] is not available on this queue`)
        }
        if( !opts.handler || !(opts.handler instanceof Function) ){
          throw new Meteor.Error(500, `Queue.handler handler function must be of type [Function]`)
        }
        this.handlers.push(_.pick(opts, ['key','handler']))
      }

      get name(){
        return this._name
      }
      set name(value){
        if( !_.isString(value) ){
          throw new Meteor.Error(500, `Queue.name must be of type [String] : ${value}`)
        }
        this._name = value
      }

      get keys(){
        if( !this._keys ){
          this.keys = []
        }
        return this._keys
      }
      set keys(value){
        if( _.isString(value) ){
          value = [value]
        }
        if( !_.isArray(value) ){
          throw new Meteor.Error(500, `Queue.keys must be of type [Array] : ${value}`)
        }
        this._keys = value
      }

      get handlers(){
        if( !this._handlers ){
          this.handlers = []
        }
        return this._handlers
      }
      set handlers(value){
        if( !_.isArray(value) ){
          throw new Meteor.Error(500, `Queue.handlers must be of type [Array] : ${value}`)
        }
        this._handlers = value
      }
    }
  }
}

Wabbit = new WabbitMQ()