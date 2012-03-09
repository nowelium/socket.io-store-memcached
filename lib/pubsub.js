var util = require('util')
  , events = require('events')
  , MemcachedQueue = require('./queue')
  , MemcachedSet = require('./set')
  ;

exports = module.exports = MemcachedPubsub;

function MemcachedPubsub (client, nodeId, opts){
  opts = opts || {};

  if(!opts.memcachedStorePubSubId){
    opts.memcachedStorePubSubId = 'socket.io_pubsub';
  }
  if(!opts.memcachedStorePubSubInterval){
    opts.memcachedStorePubSubInterval = 100;
  }

  this.client = client;
  this.nodeId = nodeId;
  this.options = opts;

  this.PUBSUB_MSG_TMPL = util.format('pubsub/%s/sub/%s/msg/%s', opts.memcachedStorePubSubId);
  this.PUBSUB_SUB_KEY = util.format('pubsub/%s/sub', opts.memcachedStorePubSubId);

  this.subscribeSet = new MemcachedSet(client, this.PUBSUB_SUB_KEY);
  this.pack = JSON.stringify;
  this.unpack = JSON.parse;

  this.setMaxListeners(0);

  this.listIndex = -1;
};
MemcachedPubsub.prototype = new events.EventEmitter();
MemcachedPubsub.prototype.end = function(cb){
  var self = this;
  self.emit('end');

  if(-1 !== this.listIndex){
    return self.subscribeSet.del(this.listIndex, function(err){
      if(err){
        return cb(err);
      }
      return self.subscribeSet.end(function (){
        return cb(null);
      });
    });
  }
  return self.subscribeSet.end(function (){
    return cb(null);
  });
};
MemcachedPubsub.prototype.publish = function(key, args){
  var nodeId = this.nodeId;
  var client = this.client;
  var self = this;

  var expires = this.options.memcachedStoreExpires;
  var PUBSUB_MSG_TMPL = this.PUBSUB_MSG_TMPL;

  var unique = function(list){
    var tmp = [];
    return list.filter(function(value){
      if(tmp.indexOf(value) < 0){
        tmp.push(value);
        return true;
      }
      return false;
    });
  };

  var message = self.pack({
    nodeId: nodeId,
    name: key,
    args: args
  });
  return self.subscribeSet.getAll(function(err, subscribers){
    if(err){
      return ;
    }

    return unique(subscribers).filter(function(subscriberId){
      if(nodeId == subscriberId){
        return false;
      }
      return true;
    }).forEach(function(subscriberId){
      var queue = new MemcachedQueue(client, util.format(PUBSUB_MSG_TMPL, subscriberId, key));
      return queue.enqueue(message, expires, function(err){
        // nop
      });
    });
  });
};
MemcachedPubsub.prototype.subscribe = function(key, consumer, cb){
  var nodeId = this.nodeId;
  var client = this.client;
  var self = this;

  var expires = this.options.memcachedStoreExpires;
  var memcachedStorePubSubInterval = this.options.memcachedStorePubSubInterval;
  var PUBSUB_MSG_TMPL = this.PUBSUB_MSG_TMPL;

  var register = function(next){
    // registration once
    if(-1 !== self.listIndex){
      return next(null);
    }

    return self.subscribeSet.add(nodeId, expires, function(errAdd, exists, listIndex){
      if(errAdd){
        return next(errAdd);
      }
      if(exists){
        return next(null);
      }
      self.listIndex = listIndex;
      return next(null);
    });
  };

  return register(function(err){
    if(err){
      return cb(err);
    }

    var messageReadable = true;
    var queue = new MemcachedQueue(client, util.format(PUBSUB_MSG_TMPL, nodeId, key));
    var readMessage = function (){
      return queue.dequeue(expires, function(err, value){
        if(err){
          return setTimeout(readMessage, memcachedStorePubSubInterval);
        }
        if(null != value){
          var message = self.unpack(value);
          var args = message.args;
          consumer.apply(null, args);
        }

        if(messageReadable){
          return setTimeout(readMessage, memcachedStorePubSubInterval);
        }
      });
    };

    var unsubscribe = function(){
      messageReadable = false;
      self.removeListener('unsubscribe' + key, unsubscribe);
    };
    self.on('unsubscribe' + key, unsubscribe);
    self.on('end', function (){
      self.emit('unsubscribe' + key);
    });
    readMessage();

    return cb();
  });
};
MemcachedPubsub.prototype.unsubscribe = function(key, cb){
  this.emit('unsubscribe' + key);
  return cb(null);
};
