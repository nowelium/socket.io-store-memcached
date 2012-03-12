/*!
 * socket.io-node
 * Copyright(c) 2012 Yusuke hata
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var crypto = require('crypto')
  , Store = require('socket.io/lib/store')
  , util = require('util')
  , MemcachedList = require('./list')
  , MemcachedMap = require('./map')
  , MemcachedPubSub = require('./pubsub')
  ;

/**
 * Exports the constructor.
 */

exports = module.exports = Memcached;
Memcached.Client = Client;

/**
 * Memory store
 *
 * @api public
 */

function Memcached (opts) {
  opts = opts || {};

  var nodeId = opts.nodeId || crypto.randomBytes(16).toString('hex');

  if (!opts.hosts) {
    opts.hosts = '127.0.0.1:11211';
  }
  if(!opts.memcachedStoreNamespace){
    opts.memcachedStoreNamespace = 'socket.io_store';
  }
  if(!opts.memcachedStoreExpires){
    opts.memcachedStoreExpires = 0;
  }

  if(opts.memcached){
    this._client = opts.memcached;
  } else {
    var memcached = require('memcached');
    this._client = new memcached(opts.hosts, opts);
  }

  this._pubsub = new MemcachedPubSub(this._client, nodeId, opts);

  Store.call(this, opts);
};

/**
 * Inherits from Store.
 */

Memcached.prototype.__proto__ = Store.prototype;

/**
 * Publishes a message.
 *
 * @api private
 */

Memcached.prototype.publish = function (name) {
  var args = Array.prototype.slice.call(arguments, 1);
  this._pubsub.publish(name, args);
  this.emit.apply(this, ['publish'].concat(args));
};

/**
 * Subscribes to a channel
 *
 * @api private
 */

Memcached.prototype.subscribe = function (name, consumer, fn) {
  if(consumer){
    this._pubsub.subscribe(name, consumer, fn || function(){});
  }

  this.emit('subscribe', name, consumer, fn);
};

/**
 * Unsubscribes
 *
 * @api private
 */

Memcached.prototype.unsubscribe = function (name, fn) {
  if(fn){
    this._pubsub.unsubscribe(name, fn);
  }
  this.emit('unsubscribe', name, fn);
};

Memcached.prototype.destroy = function (){
  Store.prototype.destroy.call(this);

  this._pubsub.end(function (){
    this._client.end(function (){
      // nop
    });
  });
};

/**
 * Client constructor
 *
 * @api private
 */

function Client (store, id) {
  Store.Client.apply(this, arguments);

  var namespace = this.store.options.memcachedStoreNamespace;
  this._keyList = new MemcachedList(this.store._client, util.format('%s/keys/%s', namespace, id));
  this._map = new MemcachedMap(this.store._client, util.format('%s/map/%s', namespace, id));
};

/**
 * Inherits from Store.Client
 */

Client.prototype.__proto__ = Store.Client;

/**
 * Gets a key
 *
 * @api public
 */

Client.prototype.get = function (key, fn) {
  this._map.get(key, fn);
  return this;
};

/**
 * Sets a key
 *
 * @api public
 */

Client.prototype.set = function (key, value, fn) {
  const expires = this.store.options.memcachedStoreExpires;
  const id = this.id;
  const map = this._map;
  const keyList = this._keyList;

  map.set(key, value, expires, function(err, set){
    if(err){
      return fn(err, null);
    }
    return keyList.add(key, expires, fn);
  });
  return this;
};

/**
 * Has a key
 *
 * @api public
 */

Client.prototype.has = function (key, fn) {
  this._map.has(key, fn);
  return this;
};

/**
 * Deletes a key
 *
 * @api public
 */

Client.prototype.del = function (key, fn) {
  this._map.del(key, fn);
  return this;
};

/**
 * Destroys the client.
 *
 * @param {Number} number of seconds to expire data
 * @api private
 */

Client.prototype.destroy = function (expiration) {
  if ('number' != typeof expiration) {
    expiration = 0;
  }

  var map = this._map;
  var keyList = this._keyList;

  keyList.getAll(function(err, values){
    if(err){
      // nop
      return ;
    }
    var delMap = function(next){
      if(values.length < 1){
        return next(null);
      }

      var key = values.shift();
      return map.del(key, function(delErr){
        if(delErr){
          return next(delErr);
        }
        return delMap(next);
      });
    };
    return delMap(function(delErr){
      if(delErr){
        // nop
        return ;
      }
      return keyList.delAll(function(){
        return keyList.end(function (){
          return map.end(function (){
            // nop
          });
        });
      });
    });
  });

  return this;
};
