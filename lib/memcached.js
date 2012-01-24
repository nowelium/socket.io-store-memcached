/*!
 * socket.io-node
 * Copyright(c) 2012 Yusuke hata
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var crypto = require('crypto')
  , Store = require('socket.io/lib//store');

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

  var memcached = require('memcached');

  if (!opts.hosts) {
    opts.hosts = '127.0.0.1:11211';
  }
  this._client = new memcached(opts.hosts, opts);

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

Memcached.prototype.publish = function () { };

/**
 * Subscribes to a channel
 *
 * @api private
 */

Memcached.prototype.subscribe = function () { };

/**
 * Unsubscribes
 *
 * @api private
 */

Memcached.prototype.unsubscribe = function () { };

Memcached.prototype.destroy = function (){
  Store.prototype.destroy.call(this);

  this._client.end();
};

/**
 * Client constructor
 *
 * @api private
 */

function Client () {
  Store.Client.apply(this, arguments);
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
  this.store.client.get(this.id + ':' + key, fn);
  return this;
};

/**
 * Sets a key
 *
 * @api public
 */

Client.prototype.set = function (key, value, fn) {
  const expires = 0;
  const util = require('util');
  const client = this.store._client;
  const storeKey = this.id + ':' + key;
  const incrementKey = this.id + '.increment';
  const listKeysTemplate = this.id + '#%d';

  cleint.set(storeKey, value, expires, function(err, set){
    if(err){
      return fn(err, null);
    }

    var increment = function(next){
      return client.gets(incrementKey, function(err, gets){
        if(err){
          return next(err, null);
        }
        if(false === gets){
          return client.set(incrementKey, '0', expires, function(err, incrementSet){
            return client.set(util.format(listKeysTemplate, '0'), key, expires, fn);
          });
        }

        const casValue = gets.cas;
        const incrementValue = 1 + Number(gets[incrementKey]);
        return client.cas(incrementKey, incrementValue, expires, function(err, cas){
          if(err){
            return next(err, null);
          }
          if(false === cas){
            return increment(next);
          }
          return client.set(util.format(listKeysTemplate, incrementValue), key, expires, fn);
        });
      });
    };
    return increment(fn);
  });
  return this;
};

/**
 * Has a key
 *
 * @api public
 */

Client.prototype.has = function (key, fn) {
  this.store._client.get(this.id + ':' + key, function(err, value){
    if(err){
      return fn(err, null);
    }
    if(false === value){
      return fn(null, false);
    }
    return fn(null, true);
  });
  return this;
};

/**
 * Deletes a key
 *
 * @api public
 */

Client.prototype.del = function (key, fn) {
  this.store._client.del(this.id + ':' + key, fn);
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

  const util = require('util');
  const client = this.store._client;
  const incrementKey = this.id + '.increment';
  const storeKeyTemplate = this.id + ':%s';
  const listKeysTemplate = this.id + '#%d';

  var expire = function(expiration, keys, next){
    var key = keys.pop();
    if(key){
      return client.get(key, function(storeKey){
        return client.del(util.format(storeKeyTemplate, storeKey), expiration, function (){
          return client.del(key, expiration, function(){
            return expire(expiration, keys, next);
          });
        });
      });
    }
    return next();
  };

  client.get(incrementKey, function(err, get){
    if(err){
      return ;
    }
    if(false === get){
      return;
    }
    var keys = [];
    var maxIncrements = Number(get);
    for(var i = maxIncrements; 0 < i; --i){
      keys.push(util.format(listKeysTemplate, i));
    }
    expire(expiration, keys, function(){
      client.del(incrementKey, expiration, function (){});
    });
  });

  return this;
};
